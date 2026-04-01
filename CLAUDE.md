# CRxUAL-AR-XR-2026

Image-triggered AR web experience for the Chancery Rosewood project. Users scan artwork with their phone camera to reveal immersive 3D content locked in place via SLAM.

## Tech Stack

- **AR Engine:** 8th Wall (loaded via CDN script tags — `XR8` global API)
- **3D Rendering:** Three.js (npm)
- **Build:** Vite 5 with HTTPS dev server
- **Deploy:** GitHub Pages

## Commands

- `npm run dev` — Start HTTPS dev server (open on mobile for camera access)
- `npm run build` — Production build to `dist/`
- `npm run preview` — Preview production build
- `npm run compile-targets` — Compile artwork photos into `.imgtar` (requires images in `public/targets/source/`)

## Architecture

### Pipeline Flow

8th Wall runs a pipeline each frame. Our custom module (`src/scene.js`) hooks into `onUpdate`/`onRender` and image target events (`reality.imagefound`, `reality.imageupdated`, `reality.imagelost`).

### Key Design Decisions

- **1 active reveal at a time** — new target detection dismisses current content
- **Tracked ↔ Free mode** — content reparented between anchor group (image-locked) and scene root (SLAM world-locked) with exponential damping transitions
- **Lazy asset loading** — GLBs loaded on first detection, cached via `modelCache` Map in `ArtworkReveal.js`
- **No separate rAF loop** — 8th Wall's pipeline drives all updates via `onUpdate`/`onRender`
- **CDN-loaded 8th Wall** — `XR8`, `XRExtras` are globals from script tags in `index.html`, not npm imports

### File Responsibilities

| File | Role |
|------|------|
| `src/main.js` | Bootstrap: desktop detection → loading → start button → engine init |
| `src/engine.js` | 8th Wall init, pipeline assembly, camera launch |
| `src/scene.js` | Custom pipeline module: lighting, render loop, image target event routing |
| `src/targets.js` | Target manager: artwork data, active reveal state, create/dismiss reveals |
| `src/reveals/RevealBase.js` | State machine + tracked/free mode switching + enter/exit animations |
| `src/reveals/ArtworkReveal.js` | GLB loading, AnimationMixer, canvas-rendered info panel |
| `src/interaction.js` | Touch input: tap (info toggle), drag (orbit), pinch (scale) |
| `src/ui.js` | DOM overlays: loading, scanning hint, HUD, errors, desktop redirect |
| `src/utils.js` | Math/easing/damping helpers, Three.js disposal |

### Data

- `public/data/artworks.json` — 20 artwork entries with metadata + model paths + scale/offset
- `public/models/` — Optimized GLB files
- `public/targets/compiled/` — Compiled `.imgtar` file for 8th Wall image detection

## Conventions

- ES modules throughout (`"type": "module"` in package.json)
- No framework — vanilla JS + Three.js
- All 3D resources must be explicitly disposed via `disposeObject()` from `utils.js`
- Info panels are canvas-rendered text on `PlaneGeometry` (not HTML overlays) for proper 3D anchoring
- Branded color: gold `#e2b657`, dark background gradient `#1a0a2e → #16213e → #0f3460`

## Content Setup

1. Place artwork photos in `public/targets/source/` as `artwork-01.jpg` through `artwork-20.jpg`
2. Run `npm run compile-targets` to generate `.imgtar`
3. Place optimized GLB models in `public/models/`
4. Update `public/data/artworks.json` with real titles, artists, descriptions, model paths
