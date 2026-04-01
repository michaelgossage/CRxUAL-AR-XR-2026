import ArtworkReveal from './ArtworkReveal.js';
import GalleryReveal from './GalleryReveal.js';

/**
 * Factory — picks the right Reveal subclass based on config.type
 *
 * Supported types:
 *   "model"   (default) — 3D GLB model via ArtworkReveal
 *   "gallery"           — Multi-panel image/video layout via GalleryReveal
 *
 * To add a new type:
 *   1. Create a new class extending RevealBase
 *   2. Add it to the REVEAL_TYPES map below
 *   3. Add type-specific fields to artworks.json
 */
const REVEAL_TYPES = {
  model: ArtworkReveal,
  gallery: GalleryReveal,
};

export default function createReveal({ scene, camera, anchorGroup, config }) {
  const type = config.type || 'model';
  const RevealClass = REVEAL_TYPES[type];

  if (!RevealClass) {
    console.error(`[Reveal] Unknown type "${type}", falling back to model`);
    return new ArtworkReveal({ scene, camera, anchorGroup, config });
  }

  return new RevealClass({ scene, camera, anchorGroup, config });
}
