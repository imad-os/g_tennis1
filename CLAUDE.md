# Grand Slam 3D Tennis for My PC

Built with My PC SDK v1 for Samsung Smart TVs (Tizen 8+, 2024+) and modern web browsers.

## Key Rules
- Load SDK via `<script src="https://imad-os.github.io/g/sdk/mypc-sdk.js"></script>`
- Input handled through `MyPC.gamepad`, `MyPC.sensors`, and `onInput`
- Lifecycle controlled via `onInit`, `onStart`, `onPause`, `onResume`, `onDestroy`
- Low-poly rounded 3D graphics rendered with Three.js
- Procedural Web Audio for all sound effects (no external MP3s)
- Phone controller motion detection via `sensor-raw` mode with DSP smoothing and swing classification
