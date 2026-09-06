"""HTTP/model contract tests; no weights, GPU or network required."""
import base64
import io
import importlib.util
from pathlib import Path
import types
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from PIL import Image
import mage_vl_sidecar as sidecar


class MageSidecarTests(unittest.TestCase):
    def setUp(self):
        sidecar._model = sidecar._processor = sidecar._device = sidecar._model_name = None
        self.client = TestClient(sidecar.app)
        modules = patch.dict('sys.modules', {
            'transformers.modeling_utils': types.SimpleNamespace(safe_open=MagicMock()),
        })
        modules.start()
        self.addCleanup(modules.stop)

    def tearDown(self):
        sidecar._model = sidecar._processor = sidecar._device = sidecar._model_name = None

    def test_health_does_not_load_weights(self):
        with patch.object(sidecar, 'load_model') as loader:
            self.assertEqual(self.client.get('/health').json()['status'], 'ready')
            loader.assert_not_called()

    def test_cpu_uses_causal_model_and_commits_cache_only_after_success(self):
        torch, transformers = MagicMock(), MagicMock()
        torch.cuda.is_available.return_value = False
        transformers.AutoProcessor.from_pretrained.side_effect = RuntimeError('processor unavailable')
        with patch.dict('sys.modules', {'torch': torch, 'transformers': transformers}):
            with self.assertRaises(RuntimeError):
                sidecar.load_model()
            self.assertIsNone(sidecar._model)
            transformers.AutoProcessor.from_pretrained.side_effect = None
            sidecar.load_model()
            kwargs = transformers.AutoModelForCausalLM.from_pretrained.call_args.kwargs
            self.assertEqual(kwargs['device_map'], 'cpu')
            self.assertEqual(kwargs['torch_dtype'], torch.float32)
            self.assertNotIn('quantization_config', kwargs)

    def test_invalid_image_does_not_load_model(self):
        with patch.object(sidecar, 'load_model') as loader:
            response = self.client.post('/analyze', json={'image_base64': 'x' * 200})
            self.assertEqual(response.status_code, 400)
            loader.assert_not_called()

    def test_cuda_quantization_and_singleton(self):
        for quant in ['4bit', '8bit', 'none']:
            with self.subTest(quant=quant):
                sidecar._model = sidecar._processor = sidecar._device = sidecar._model_name = None
                torch, transformers = MagicMock(), MagicMock()
                torch.cuda.is_available.return_value = True
                with patch.dict('sys.modules', {'torch': torch, 'transformers': transformers}), patch.dict('os.environ', {'MAGEVL_QUANT': quant}):
                    first = sidecar.load_model()
                    self.assertEqual(first, sidecar.load_model())
                transformers.AutoModelForCausalLM.from_pretrained.assert_called_once()
                kwargs = transformers.AutoModelForCausalLM.from_pretrained.call_args.kwargs
                self.assertEqual(kwargs['device_map'], 'auto')
                self.assertEqual('quantization_config' in kwargs, quant != 'none')
                if quant != 'none':
                    self.assertTrue(transformers.BitsAndBytesConfig.call_args.kwargs[f'load_in_{quant}'])

    def test_model_failure_remains_retryable(self):
        torch, transformers = MagicMock(), MagicMock()
        transformers.AutoModelForCausalLM.from_pretrained.side_effect = RuntimeError('out of memory')
        with patch.dict('sys.modules', {'torch': torch, 'transformers': transformers}):
            with self.assertRaises(RuntimeError):
                sidecar.load_model()
        self.assertIsNone(sidecar._model)
        self.assertIsNone(sidecar._processor)
        self.assertEqual(self.client.get('/health').json()['status'], 'ready')

    def test_windows_load_uses_pread_without_leaking_transformers_patch(self):
        torch, transformers = MagicMock(), MagicMock()
        modeling_utils = types.SimpleNamespace(safe_open=MagicMock(return_value='opened'))

        def load_weights(*_args, **_kwargs):
            self.assertIsNot(modeling_utils.safe_open, original_safe_open)
            self.assertEqual(sidecar.os.environ.get('HF_DEACTIVATE_ASYNC_LOAD'), '1')
            modeling_utils.safe_open('weights.safetensors', framework='pt', device='cpu', backend='mmap')
            return MagicMock()

        original_safe_open = modeling_utils.safe_open
        transformers.AutoModelForCausalLM.from_pretrained.side_effect = load_weights
        with patch.dict('sys.modules', {
            'torch': torch,
            'transformers': transformers,
            'transformers.modeling_utils': modeling_utils,
        }), patch.object(sidecar.os, 'name', 'nt'), patch.dict('os.environ'):
            sidecar.os.environ.pop('HF_DEACTIVATE_ASYNC_LOAD', None)
            sidecar.load_model()
            self.assertNotIn('HF_DEACTIVATE_ASYNC_LOAD', sidecar.os.environ)

        self.assertIs(modeling_utils.safe_open, original_safe_open)
        self.assertEqual(original_safe_open.call_args.kwargs['backend'], 'pread')

    def test_windows_pread_restores_originals_after_load_failure(self):
        original = MagicMock()
        modeling_utils = types.SimpleNamespace(safe_open=original)
        with patch.dict('sys.modules', {'transformers.modeling_utils': modeling_utils}), \
                patch.object(sidecar.os, 'name', 'nt'), \
                patch.dict('os.environ', {'HF_DEACTIVATE_ASYNC_LOAD': '0'}):
            with self.assertRaisesRegex(RuntimeError, 'load failed'):
                with sidecar.windows_pread_weights():
                    self.assertEqual(sidecar.os.environ['HF_DEACTIVATE_ASYNC_LOAD'], '1')
                    raise RuntimeError('load failed')
            self.assertIs(modeling_utils.safe_open, original)
            self.assertEqual(sidecar.os.environ['HF_DEACTIVATE_ASYNC_LOAD'], '0')

    def test_non_windows_loader_is_unchanged(self):
        with patch.object(sidecar.os, 'name', 'posix'), \
                patch.object(sidecar.importlib, 'import_module') as importer:
            with sidecar.windows_pread_weights():
                pass
            importer.assert_not_called()

    def test_bundled_image_only_mamba_refuses_video_execution(self):
        path = Path(__file__).parent / 'image-only-mamba' / 'mamba_ssm' / 'models' / 'mixer_seq_simple.py'
        self.assertTrue(path.is_file(), 'Image-only setup must include the optional-import shim')
        spec = importlib.util.spec_from_file_location('image_only_mamba_test', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with self.assertRaisesRegex(NotImplementedError, 'mamba-ssm'):
            module.create_block(2560)

    def test_image_inference_uses_chat_template_and_decodes_only_new_tokens(self):
        buffer = io.BytesIO()
        Image.new('RGB', (32, 32), 'blue').save(buffer, format='PNG')
        model, processor, torch = MagicMock(), MagicMock(), MagicMock()
        inputs = MagicMock()
        ids, pixels = MagicMock(), MagicMock()
        ids.shape = (1, 5)
        ids.to.return_value = ids
        pixels.to.return_value = pixels
        inputs.items.return_value = [('input_ids', ids), ('pixel_values', pixels)]
        inputs.to.return_value = inputs
        processor.return_value = inputs
        processor.apply_chat_template.return_value = 'templated-image-prompt'
        processor.tokenizer.decode.return_value = ' blue square '
        processor.batch_decode.return_value = ['What color? blue square']
        with patch.object(sidecar, 'load_model', return_value=(model, processor, 'cpu', 'test/mage')), patch.dict('sys.modules', {'torch': torch}):
            response = self.client.post('/analyze', json={
                'image_base64': base64.b64encode(buffer.getvalue()).decode(), 'prompt': 'What color?',
            })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['text'], 'blue square')
        processor.apply_chat_template.assert_called_once()
        self.assertEqual(processor.call_args.kwargs['text'], ['templated-image-prompt'])
        model.generate.return_value.__getitem__.assert_called_once_with((0, slice(5, None)))


if __name__ == '__main__':
    unittest.main()
