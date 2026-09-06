# Desktop pet verification — 2026-09-06

## Implemented

- Separate 420×600 Electron `BrowserWindow` with transparent, frameless, always-on-top, non-focusable, non-resizable, taskbar-skipping and mouse-through behavior.
- Content protection enabled on the pet window to reduce recursive self-observation.
- Same-origin `BroadcastChannel` carries the main renderer's latest screen observation to the pet renderer; no second capture or vision model is created.
- Screen observation contract adds context kind, visible state, one next suggestion, prompt feedback and confidence.
- Advice is suppressed below 0.55 confidence; prompt feedback wins over generic advice when the context is a visible prompt.
- Original transparent PNG character asset: a clearly adult silver-white-haired anime companion in a tailored navy-and-white academy-inspired outfit. A user-supplied third-party image informed only the white/ice-blue palette, approachable wink, and airy mood; the face, asymmetric bob and braid, geometric clasp, tailored utility outfit, silhouette, and open-palm pose were newly designed.

## Fresh evidence

- RED: targeted Vitest run initially failed with 3 missing observation fields plus missing `desktopPetState` module.
- GREEN: targeted run passed 3 files / 11 tests.
- Full client tests: 16 files / 65 tests passed.
- Client production build: passed; Vite reported only the existing large-chunk advisory.
- Client lint: exit 0 with four pre-existing warnings outside the new desktop-pet files.
- Electron TypeScript build: passed.
- Impeccable mechanical detector: `[]`.
- Browser visual inspection: real PNG alpha verified (transparent corner alpha 0, `Format32bppArgb`); fixed 420×600 composition inspected. The bubble width was reduced from 258px to 224px so the new face remains visible while the open-palm gesture leads toward the panel.
- Character asset: 1024×1536 PNG, SHA-256 `D58DE57D94B810EBDD1E31B602B035A51E1F5F032A91189A5C32287CAAB0C4C4`.
- Layout TDD RED: expected bubble width ≤224px, observed 258px. GREEN: desktop-pet targeted tests 2 / 2 passed.
- Latest full client regression after the replacement: 17 files / 69 tests passed; production build passed; lint exited 0 with four pre-existing warnings outside the desktop-pet files.
- Electron smoke launch: backend reached `http://localhost:3002`, application remained running until intentional SIGINT, then port 3002 and Electron processes were confirmed clean. Chromium emitted repeated `chunked_data_pipe_upload_data_stream.cc` error `-2`; it did not terminate the app and remains separate follow-up evidence rather than a passed network check.

## Not yet verified

- Real Mage-VL screen-sharing content flowing end-to-end into the pet while observing Arduino IDE or another chosen application.
- Reliable game title/HUD extraction for any specific game.
- Tray-based persistence after closing the main window, draggable positioning and multi-display position memory.
