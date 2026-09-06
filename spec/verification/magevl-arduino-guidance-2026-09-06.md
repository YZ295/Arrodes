# Mage-VL Arduino guidance verification — 2026-09-06

## Environment

- Windows local runtime: `E:\AI\magevl-env\Scripts\python.exe`, Python 3.10.20.
- The environment now resolves its base runtime from `E:\AI\magevl-python`; the earlier stale `D:`-drive diagnosis is no longer true.
- PyTorch 2.5.1+cu121 reports CUDA available on the RTX 4060 Laptop GPU.
- Local cached `microsoft/Mage-VL` checkpoint loaded in 4-bit mode.

## Real inference evidence

- Sidecar unit tests: 10 / 10 passed.
- Warm sidecar model load: 13.8 seconds.
- Direct sidecar inference on the controlled Arduino IDE fixture: 7.247 seconds.
- Public Node vision route inference on the same fixture: 8.464 seconds.
- GPU after model load: 6299 MiB used, 1659 MiB free out of 8188 MiB.

The model correctly extracted `Done compiling.` but one public-route response still described the state as compiling and advised waiting. This proves that valid JSON is not equivalent to a trustworthy task state.

## Deterministic evidence adapter

- Added an `arduino-ide` guidance profile.
- Visible `Done compiling.` now normalizes the state to `Blink 编译已完成`, chooses upload as the single next action, and waits for `Done uploading.`.
- Visible error evidence blocks advancement and directs the user to the first error.
- Visible `Done uploading.` advances only the screen-side state; it does not claim the physical LED is blinking.
- Generic screens retain the model observation but suppress an action when evidence confidence is below 0.55 or uncertainties remain.

## Fresh regression evidence

- Guidance RED run: three expected failures before implementation.
- Guidance GREEN run: 2 files / 13 tests passed.
- Full client tests: 16 files / 68 tests passed.
- Client production build and Electron TypeScript build passed.
- Client lint exited 0 with four pre-existing warnings outside the guidance files.
- Full server tests after aligning the recovery diagnostics: 57 files / 307 tests passed.
- Server TypeScript build passed.

## Remaining acceptance gap

This is a real local model and public API inference over a controlled Arduino IDE screenshot. It is not yet a live Electron screen-share run from the user's current desktop into the pet. That live permission/capture path and an actual Arduino upload remain the next acceptance step.
