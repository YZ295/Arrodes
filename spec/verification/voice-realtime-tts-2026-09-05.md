# Voice cancellation and TTS providers — verification

Date: 2026-09-05

## Scope

- Preserve the existing Node/TypeScript STT → LLM → TTS architecture.
- Propagate one cancellation signal through TTS HTTP synthesis, provider retry waits, audio playback, pipeline completion hooks, and the existing CosyVoice2 proxy.
- Add explicit `cosyvoice2`, `cosyvoice3`, and `audio8` providers.
- Keep CosyVoice3 isolated behind a separately launched sidecar and port; do not overwrite the CosyVoice2 environment.
- Do not download model weights in this change.

## RED evidence

- Server provider/cancellation tests: 3 new failures. The old service returned `local`, routed `cosyvoice3` to CosyVoice2, ignored an already-aborted signal, and retried five times after cancellation.
- Provider adapter suite initially failed because `ttsProviders.ts` did not exist.
- Client TTS-stage tests: 2 failures. `speak` received no signal and was called even when already cancelled.
- Client linked-controller tests: 2 failures because the helper did not exist.
- Pipeline cancellation test: cancellation was swallowed by `continueOnError` and attributed to the following stage.
- Audio8 contract test: the first adapter sent generic `voice/speed`; the official Audio8 contract requires `references[{audio_path,text}]` for cloning.

## GREEN evidence

- Targeted server provider/service suites: 10 tests passed.
- Targeted client cancellation/provider-selection suites: 13 tests passed.
- Full server suite: 56 files, 300 tests passed.
- Full client suite: 11 files, 42 tests passed.
- Server `npm run typecheck`: passed.
- Client `tsc -b --pretty false`: passed.
- Server `npm run build`: passed.
- Client `npm run build`: passed; Vite reported only the existing chunk-size advisory.
- Client `npm run lint`: exit 0 with four pre-existing warnings outside the new TTS implementation.
- Python AST parse and PowerShell parser check for the two sidecar launch files: passed.
- Current-host provider-status smoke check: `cosyvoice2=true`, `cosyvoice3=false`, `audio8=false`, matching the fact that the two new services are not configured yet.

## Runtime boundary

No real CosyVoice3 or Audio8 inference was claimed: their weights/services are not installed or started by this change. The settings UI enables them only when the server starts with the corresponding provider URL configured.

## CosyVoice3 adoption follow-up (2026-09-05)

- Installed the official `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` snapshot in an isolated `cosyvoice3` environment; 20 model files, 9.08 GB, no partial files.
- RTX 4060 Laptop 8 GB cold run: model load 18.0 s; 10.2 s output synthesized in 8.2 s (RTF 0.75); request wall time 34.18 s including initialization; peak total GPU memory 7,121 MiB.
- Warm run: 5.08 s output in 3.86 s (reported RTF 0.65); peak total GPU memory 6,509 MiB.
- Both generated WAV files are 24 kHz mono PCM16, non-empty, and contain no clipped samples.
- CosyVoice2 comparison: model directory 5.23 GB; 9.96 s output synthesized in 7.4 s (RTF 0.70); cold peak total GPU memory 5,876 MiB.
- Adoption RED: server 7 failures and client 6 failures proved defaults and saved-config migration still targeted CosyVoice2.
- Adoption GREEN: server 56 files / 303 tests passed; client 11 files / 48 tests passed; both type checks and production builds passed; Python compile passed; client lint exited 0 with four pre-existing warnings.
- Decision: make CosyVoice3 the sole canonical local provider; map legacy `cosyvoice2/server/local/edge/web` values to `cosyvoice3`; keep Audio8 optional.
- Post-removal E2E: the built Node service automatically launched the CosyVoice3 sidecar on port 12003 and returned a non-empty Base64 WAV with canonical engine `cosyvoice3` in about 24 seconds.
- Cleanup: removed Conda environment `D:\Anaconda\envs\cosyvoice`; sent the 5.23 GB `CosyVoice2-0.5B` model directory to Windows Recycle Bin. The shared source tree, custom voices, generated samples, CosyVoice3 environment, and CosyVoice3 model remain.
