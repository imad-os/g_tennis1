# Full-Screen Render Resolution & TV Scaling Engine

A dedicated performance and render scaling architecture enabling selectable internal rendering resolutions (480p, 720p, 1080p, and Native Auto) scaled to full screen with user-configurable hardware scaling filters (Smooth Bilinear vs Crisp Pixelated).

## User Review & Critical Decisions

> [!IMPORTANT]
> The following design decisions were confirmed through interactive clarification:
> - **Confirmed Resolution Presets**: 480p (Fast / High FPS), 720p (Balanced HD), 1080p (Full HD), and Native Auto (1:1 viewport matching).
> - **Confirmed Scaling Filter Options**: In addition to native TV display scaling, configurable canvas texture filtering options in settings: **Smooth (Bilinear interpolation)** and **Pixelated (Crisp edges)**.

---

## 1. Overview & Core Concept

- **What It Does**: Decouples the 3D WebGL render buffer resolution from the full-screen display dimensions. The canvas continues to fill 100% of the screen/TV, while the GPU renders the 3D geometry and shaders at a fixed, lower pixel count (such as 480p or 720p). This dramatically reduces GPU pixel fill-rate strain and thermal throttling on TV chips, smart dongles, and lower-spec laptops, providing a fluid 60 FPS gameplay experience without altering UI sharpness.
- **Target Audience / Persona**: Samsung Smart TV users, low-to-mid range devices, and competitive players who want maximum framerate stability.
- **Key Value**: Massive performance boost (up to 3x higher FPS at 480p/720p) while preserving seamless full-screen presentation and 100% coordinate fidelity for the floating safe-zone power gauge and in-game HUD.

---

## 2. User Experience & Visual Design

- **Graphics Settings Integration**:
  - A new **"Render Resolution"** control block under Settings > Graphics tab.
  - Quick-switch selector pills:
    - **480p** (854×480 base, ~0.4M pixels - Maximum Performance & Battery Life)
    - **720p** (1280×720 base, ~0.9M pixels - Balanced High Performance HD)
    - **1080p** (1920×1080 base, ~2.1M pixels - Crisp Full HD)
    - **Native Auto** (Matches device container pixels 1:1)
  - A new **"Display Scaling Filter"** selector:
    - **Smooth** (`image-rendering: auto` - Smooth bilinear hardware upscaling by TV/GPU)
    - **Pixelated** (`image-rendering: pixelated` - Crisp integer scaling with sharp edges)
- **Live In-Game HUD Indicator**:
  - The in-game camera/graphics toolbar displays the active resolution badge with an option to toggle quickly.
- **HUD and UI Isolation**:
  - The HTML5/React HUD overlay, floating power meter, scoreboard, and modals remain rendered in crisp native screen resolution while only the 3D WebGL canvas utilizes the downscaled render target.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: `renderer.setSize(w, h, false)` with CSS 100% Fill**:
  - *Chosen Approach*: Call `renderer.setSize(internalWidth, internalHeight, false)` where `updateStyle: false` leaves the canvas CSS style intact (`position: absolute; width: 100%; height: 100%; inset: 0`).
  - *Why*: Allows the browser and TV hardware display compositor to scale the lower-resolution render buffer to the full screen automatically without letterboxing or distortion.
  - *Alternatives Considered*: Scaling via CSS transforms or viewport meta tags, which degrade HUD quality and disrupt touch/mouse coordinate spaces.
- **Decision 2: Aspect-Ratio Preserving Internal Buffers**:
  - *Chosen Approach*: Fix the vertical line count (480, 720, 1080) and dynamically compute `internalWidth = Math.round(targetHeight * aspect)` where `aspect = containerWidth / containerHeight`.
  - *Why*: Perfectly preserves the camera field of view (FOV) and 3D court aspect ratio without horizontal stretching on ultrawide, 16:9, or 4:3 displays.
- **Decision 3: Preserving Screen-Space Projection for Dynamic Gauge**:
  - *Chosen Approach*: `scene.projectToScreen(worldPos)` converts Three.js normalized device coordinates (NDC -1..+1) to screen percentage (0%..100%).
  - *Why*: Because percentage-based coordinates remain invariant under canvas render buffer downscaling, the floating safe-zone gauge remains accurately anchored to the 3D player.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Application Viewport                          │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                 React In-Game HUD (Native 1080p/4K)              │  │
│  │   [Scoreboard]      [Floating Power Gauge]       [Settings/Zoom] │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                  │                                     │
│                                  ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │             WebGL Renderer Canvas (Full Screen CSS 100%)          │  │
│  │   CSS: width: 100%; height: 100%; image-rendering: auto/pixelated│  │
│  │                                                                  │  │
│  │   Internal Resolution Options:                                   │  │
│  │   ├─ 480p:  854 × 480   (Ultra-low GPU load, maximum 60fps)       │  │
│  │   ├─ 720p:  1280 × 720  (Optimal HD performance)                 │  │
│  │   ├─ 1080p: 1920 × 1080 (High fidelity)                          │  │
│  │   └─ Auto:  Native Viewport × DevicePixelRatio                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                  │                                     │
│                                  ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │     GraphicsConfig State & ThreeScene3D Buffer Configuration     │  │
│  │   renderResolution: '480p' | '720p' | '1080p' | 'auto'           │  │
│  │   scalingFilter: 'smooth' | 'pixelated'                          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Additions

1. **`src/types/game.ts`**:
   - `export type RenderResolution = '480p' | '720p' | '1080p' | 'auto';`
   - `export type ScalingFilter = 'smooth' | 'pixelated';`
   - Add `renderResolution: RenderResolution;` and `scalingFilter: ScalingFilter;` to `GraphicsConfig`.

2. **`src/game/threeRenderer.ts`**:
   - Update `handleResize()` and `setResolution(res: RenderResolution, filter: ScalingFilter)`:
     - Compute target dimensions:
       - `'480p'`: height = 480, width = Math.round(480 * aspect)
       - `'720p'`: height = 720, width = Math.round(720 * aspect)
       - `'1080p'`: height = 1080, width = Math.round(1080 * aspect)
       - `'auto'`: width = container.clientWidth, height = container.clientHeight
     - Invoke `this.renderer.setSize(w, h, false)`.
     - Update canvas style `imageRendering = filter === 'pixelated' ? 'pixelated' : 'auto'`.
     - Update camera aspect ratio and projection matrix.

3. **`src/components/SettingsModal.tsx`**:
   - Add interactive selector grid for Render Resolution under the Graphics tab.
   - Add interactive selector for Scaling Filter (Smooth vs Pixelated).
   - Support remote arrow keys (Left / Right / Up / Down / OK) and gamepad navigation.

4. **`src/components/MatchHUD.tsx` & `src/App.tsx`**:
   - Forward `renderResolution` and `scalingFilter` to the 3D scene whenever changed.
