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

## Compiling Image Targets

The 8th Wall CLI is interactive. Run it directly with `npx` and answer 5 prompts:

```
npx @8thwall/image-target-cli@latest
```

Prompts and expected answers:
1. **Path to image file** → `public/targets/source/<filename>.jpg` (or .png)
2. **Image type** → `1` (flat — always use this for artworks)
3. **Use default crop?** → `Y`
4. **Output folder** → `public/targets/compiled`
5. **Name for the image target** → the stem of the source filename (e.g. `Nailed-GenevieveCarr` for `Nailed-GenevieveCarr.jpg`). For v2 sources, include the `2` suffix (e.g. `Nailed-GenevieveCarr2`).

Output: `public/targets/compiled/<name>.json` + 4 derivative images (`_original`, `_cropped`, `_luminance`, `_thumbnail`) directly in `public/targets/compiled/`.

After compiling, update `artworks.json` for that artwork:
- `"targetName"` must match the name you entered at prompt 5
- `"targetData"` must point to `./targets/compiled/<name>.json`

### Source images

All source artwork photos live in `public/targets/source/`. Naming convention: `ArtistName-ArtworkTitle.jpg` (or `.png`). If a v2 exists (higher quality), use `ArtistName-ArtworkTitle2.png` and compile that one instead — it takes priority over v1.

### Compiled target formats

Two formats exist in `public/targets/compiled/` (both work):
- **Flat** (new): `compiled/<name>.json` + `<name>_*.jpg` files in root — produced by the CLI above
- **Subfolder** (legacy): `compiled/<name>/<name>.json` + derivative images inside subfolder — used by older entries

The engine resolves both correctly by stripping the `image-targets/` prefix from `imagePath` in the JSON.

---

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
| `src/engine.js` | 8th Wall init, target data loading, pipeline assembly, camera launch |
| `src/scene.js` | Custom pipeline module: lighting, render loop, image target event routing |
| `src/targets.js` | Target manager: artwork data, active reveal state, create/dismiss reveals |
| `src/reveals/RevealBase.js` | State machine + tracked/free mode switching + enter/exit animations |
| `src/reveals/ArtworkReveal.js` | Single GLB loading, AnimationMixer (loops all clips), optional overlay |
| `src/reveals/GalleryReveal.js` | Image/video panel layouts: row, arc, grid, carousel with dot nav |
| `src/reveals/ModelCarouselReveal.js` | Ring of GLBs: auto-spin or tap-nav, dynamic scale highlight |
| `src/reveals/createReveal.js` | Factory: picks reveal class from `config.type` |
| `src/interaction.js` | Touch input: tap (info toggle), drag (orbit), pinch (scale) |
| `src/ui.js` | DOM overlays: loading, scanning hint, HUD, errors, desktop redirect |
| `src/utils.js` | Math/easing/damping helpers, Three.js disposal |

### Reveal Types

Three reveal types are selected via `"type"` in `artworks.json`:

| type | Class | Use when |
|------|-------|----------|
| *(omit)* | `ArtworkReveal` | Single GLB model; animates if the GLB has clips |
| `"gallery"` | `GalleryReveal` | One or more images/videos on floating panels |
| `"model-carousel"` | `ModelCarouselReveal` | Multiple GLBs arranged in a spinning ring |

### Data

- `public/data/artworks.json` — all artwork entries (see schema below)
- `public/data/<ArtistFolder>/` — per-artist GLB models and source images
- `public/targets/source/` — source artwork photos for target compilation
- `public/targets/compiled/` — compiled target JSON + derivative images (one entry per artwork)

### artworks.json Schema

Every entry must have: `id`, `targetName`, `targetData`, `title`, `artist`, `year`, `description`.

**Single model (default):**
```json
{
  "id": "Nailed",
  "targetName": "Nailed-GenevieveCarr",
  "targetData": "./targets/compiled/Nailed-GenevieveCarr/Nailed-GenevieveCarr.json",
  "title": "Nailed", "artist": "Genevieve Carr", "year": "2025", "description": "...",
  "model": "./data/Nailed_Genevieve Carr/model.glb",
  "scale": 1.0,
  "offset": [0, 1, 0],
  "showOverlay": false
}
```

**Image gallery:**
```json
{
  "type": "gallery",
  "panels": [
    { "src": "./data/Artist/image.jpg", "width": 0.3, "height": 0.4, "caption": "" }
  ],
  "layout": "carousel",
  "spacing": 0.35,
  "curve": 0.5,
  "scale": 3,
  "offset": [0, 1, 0]
}
```
Layouts: `"row"`, `"arc"`, `"grid"`, `"carousel"`. Carousel uses `curve` (0 = flat, 1 ≈ 144° arc).

**Model carousel:**
```json
{
  "type": "model-carousel",
  "autoSpin": true,
  "spinSpeed": 0.2,
  "radius": 0.6,
  "offset": [0, 1.0, 0],
  "items": [
    { "model": "./data/Artist/piece1.glb", "scale": 0.06 }
  ]
}
```

---

## Conventions

- ES modules throughout (`"type": "module"` in package.json)
- No framework — vanilla JS + Three.js
- All 3D resources must be explicitly disposed via `disposeObject()` from `utils.js`
- Branded color: gold `#e2b657`, dark background gradient `#1a0a2e → #16213e → #0f3460`

## Adding a New Artwork

1. Drop source image into `public/targets/source/<ArtistName-Title>.jpg`
2. Compile it (see Compiling Image Targets above)
3. Drop GLB / images into `public/data/<ArtistFolder>/`
4. Add an entry to `public/data/artworks.json` — pick the right reveal type
5. If the artwork has GLB animations, they loop automatically (no config needed)
