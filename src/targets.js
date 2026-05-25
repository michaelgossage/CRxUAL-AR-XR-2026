// Target manager — loads artwork metadata, handles image target events, manages active reveal
import createReveal from './reveals/createReveal.js';
import { triggerHaptic, showHUD, hideHUD, showScanning, hideScanning, showInfoPanel, hideInfoPanel } from './ui.js';

let artworks = [];
let artworkMap = new Map();
let activeReveal = null;
let activeTargetName = null;
let exitingReveals = []; // reveals playing their exit animation
let sceneRef = null;
let cameraRef = null;
let anchorGroups = new Map(); // targetName → THREE.Group

function resolveUrl(path) {
  if (path && path.startsWith('./')) {
    return import.meta.env.BASE_URL + path.slice(2);
  }
  return path;
}

export async function loadArtworkData() {
  const res = await fetch(import.meta.env.BASE_URL + 'data/artworks.json');
  artworks = await res.json();

  // Normalize all relative paths to absolute using the deployment base URL
  for (const aw of artworks) {
    if (aw.targetData) aw.targetData = resolveUrl(aw.targetData);
    if (aw.model) aw.model = resolveUrl(aw.model);
    if (aw.panels) {
      for (const p of aw.panels) {
        if (p.src) p.src = resolveUrl(p.src);
      }
    }
    if (aw.items) {
      for (const item of aw.items) {
        if (item.model) item.model = resolveUrl(item.model);
      }
    }
    artworkMap.set(aw.targetName, aw);
  }

  return artworks;
}

export function initTargets({ scene, camera }) {
  sceneRef = scene;
  cameraRef = camera;
}

export function getTargetNames() {
  return artworks.map((a) => a.targetName);
}

// Called by scene pipeline on imagefound
export async function onImageFound(detail) {
  const { name, position, rotation, scale } = detail;
  console.log(`[AR] onImageFound name="${name}", known targets: [${[...artworkMap.keys()].join(', ')}]`);
  const config = artworkMap.get(name);
  if (!config) {
    console.error(`[AR] No artwork config for target "${name}" — check targetName in artworks.json matches the name in the target JSON`);
    return;
  }
  console.log(`[AR] Matched artwork: "${config.title}", model: ${config.model}`);
  console.log(`[AR] activeReveal=${!!activeReveal}, activeTargetName=${activeTargetName}, sceneRef=${!!sceneRef}, cameraRef=${!!cameraRef}`);

  // If same target re-found, switch back to tracked
  if (activeReveal && activeTargetName === name && !activeReveal.isDisposed) {
    console.log(`[AR] Same target re-found, switching to tracked`);
    const anchor = anchorGroups.get(name);
    updateAnchor(anchor, position, rotation);
    activeReveal.switchToTracked(anchor);
    return;
  }

  // Different target — dismiss current
  if (activeReveal && !activeReveal.isExiting && !activeReveal.isDisposed) {
    console.log(`[AR] Dismissing previous reveal`);
    activeReveal.exit();
    exitingReveals.push(activeReveal);
    activeReveal = null;
    activeTargetName = null;
    hideHUD();
    hideInfoPanel();
  }

  if (!sceneRef || !cameraRef) {
    console.error(`[AR] Scene or camera not initialized! sceneRef=${!!sceneRef} cameraRef=${!!cameraRef}`);
    return;
  }

  // Create anchor group
  let anchor = anchorGroups.get(name);
  if (!anchor) {
    const THREE = await import('three');
    anchor = new THREE.Group();
    sceneRef.add(anchor);
    anchorGroups.set(name, anchor);
  }
  updateAnchor(anchor, position, rotation);

  console.log(`[AR] Creating reveal (type="${config.type || 'model'}")…`);

  // Create new reveal via factory
  activeTargetName = name;
  const reveal = createReveal({
    scene: sceneRef,
    camera: cameraRef,
    anchorGroup: anchor,
    config,
    physicalWidth: scale,
  });

  activeReveal = reveal;

  hideScanning();
  triggerHaptic();

  // Load and enter
  try {
    console.log(`[AR] Loading reveal for "${name}"…`);
    await reveal.load();
    console.log(`[AR] Reveal loaded, root children: ${reveal.root.children.length}, root visible: ${reveal.root.visible}`);
    // Check it wasn't replaced during async load
    if (activeReveal === reveal) {
      reveal.enter();
      console.log(`[AR] Reveal entered — state: ${reveal.state}, root visible: ${reveal.root.visible}, root scale: ${reveal.root.scale.x}`);
      console.log(`[AR] Anchor pos: (${anchor.position.x.toFixed(2)}, ${anchor.position.y.toFixed(2)}, ${anchor.position.z.toFixed(2)})`);
      showHUD(`${config.title} — ${config.artist}`);
      const onClose = () => {
        if (activeReveal && !activeReveal.isExiting) {
          activeReveal.exit();
          hideHUD();
        }
      };
      const isModelCarousel = config.type === 'model-carousel';
      showInfoPanel(
        config,
        onClose,
        isModelCarousel ? () => reveal.navigate(-1) : null,
        isModelCarousel ? () => reveal.navigate(1) : null,
      );
    } else {
      console.warn(`[AR] Reveal replaced during load, disposing`);
      reveal.dispose();
    }
  } catch (err) {
    console.error(`[AR] Failed to load artwork reveal:`, err);
    if (activeReveal === reveal) {
      activeReveal = null;
      activeTargetName = null;
      showScanning();
    }
  }
}

// Called by scene pipeline on imageupdated
export function onImageUpdated(detail) {
  const { name, position, rotation } = detail;
  const anchor = anchorGroups.get(name);
  if (anchor) {
    updateAnchor(anchor, position, rotation);
  }
}

// Called by scene pipeline on imagelost
export function onImageLost(detail) {
  const { name } = detail;
  if (activeReveal && activeTargetName === name && !activeReveal.isDisposed) {
    activeReveal.switchToFree();
  }
}

// Update anchor group transform from 8th Wall data
function updateAnchor(group, position, rotation) {
  group.position.set(position.x, position.y, position.z);
  group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
}

// Tick active reveal (called from render loop)
export function tickReveals(dt) {
  // Tick exiting reveals so their exit animations complete
  for (let i = exitingReveals.length - 1; i >= 0; i--) {
    exitingReveals[i].tick(dt);
    if (exitingReveals[i].isDisposed) {
      exitingReveals.splice(i, 1);
    }
  }

  if (activeReveal) {
    activeReveal.tick(dt);
    if (activeReveal.isDisposed) {
      activeReveal = null;
      activeTargetName = null;
      hideInfoPanel();
      showScanning();
    }
  }
}

export function getActiveReveal() {
  return activeReveal;
}
