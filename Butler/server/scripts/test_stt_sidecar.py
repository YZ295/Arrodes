import unittest

import stt_sidecar


class SttSidecarModelConfigTest(unittest.TestCase):
    def tearDown(self):
        stt_sidecar.MODEL = None
        stt_sidecar.LOADED = False

    def test_model_is_forced_to_cpu_int8(self):
        calls = []

        def fake_model(name, **kwargs):
            calls.append((name, kwargs))
            return object()

        original = stt_sidecar.WhisperModel
        try:
            stt_sidecar.WhisperModel = fake_model
            self.assertTrue(stt_sidecar.ensure_model())
        finally:
            stt_sidecar.WhisperModel = original

        self.assertEqual(
            calls,
            [(stt_sidecar.MODEL_NAME, {"device": "cpu", "compute_type": "int8"})],
        )


if __name__ == "__main__":
    unittest.main()
