// 8th Wall + Three.js engine initialization
import { createSceneModule, getSceneRefs } from './scene.js';
import { loadArtworkData } from './targets.js';
import { initInteraction } from './interaction.js';
import { setLoadingProgress, showScanning } from './ui.js';

// Wait for XR8 to be available (self-hosted async script)
function waitForXR8(timeout = 30000) {
  return new Promise((resolve, reject) => {
    if (window.XR8) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      window.removeEventListener('xrloaded', onLoaded);
      reject(new Error('8th Wall engine failed to load. Make sure xr.js is in the public/xr/ folder.'));
    }, timeout);

    function onLoaded() {
      clearTimeout(timer);
      resolve();
    }
    window.addEventListener('xrloaded', onLoaded);
  });
}

export async function initEngine() {
  const canvas = document.getElementById('ar-canvas');

  setLoadingProgress(10, 'Loading AR engine…');

  // Wait for self-hosted 8th Wall engine
  await waitForXR8();
  console.log('[AR] XR8 engine loaded, version:', XR8.version?.() || 'unknown');

  setLoadingProgress(30, 'Loading artwork data…');

  // Load artwork metadata
  const artworks = await loadArtworkData();
  console.log(`[AR] Loaded ${artworks.length} artworks from artworks.json`);

  setLoadingProgress(40, 'Loading image targets…');

  // Load image target JSON data for each artwork that has a targetData path
  const imageTargetData = [];
  for (const aw of artworks) {
    if (aw.targetData) {
      try {
        const res = await fetch(aw.targetData);
        if (!res.ok) {
          console.error(`[AR] Failed to fetch target data for "${aw.targetName}": HTTP ${res.status} — ${aw.targetData}`);
          continue;
        }
        const data = await res.json();

        // Resolve imagePath relative to the JSON file's directory
        const jsonDir = aw.targetData.substring(0, aw.targetData.lastIndexOf('/') + 1);
        const origImagePath = data.imagePath;
        // If imagePath isn't already absolute, resolve it relative to the JSON file
        if (data.imagePath && !data.imagePath.startsWith('/') && !data.imagePath.startsWith('http')) {
          // Strip any incorrect prefix like "image-targets/"
          const filename = data.imagePath.split('/').pop();
          data.imagePath = jsonDir + filename;
        }
        console.log(`[AR] Loaded target data for "${aw.targetName}" — imagePath: "${origImagePath}" → "${data.imagePath}"`);

        imageTargetData.push(data);
      } catch (err) {
        console.error(`[AR] Failed to load target data for "${aw.targetName}":`, err);
      }
    } else {
      console.warn(`[AR] No targetData path for "${aw.targetName}" — skipping`);
    }
  }

  setLoadingProgress(50, 'Configuring AR…');

  // Configure image targets with loaded data (self-hosted approach)
  if (imageTargetData.length > 0) {
    console.log(`[AR] Configuring ${imageTargetData.length} image targets (self-hosted)`);
    XR8.XrController.configure({ imageTargetData });
  } else {
    // Fallback: use target names (for legacy .imgtar format)
    const targetNames = artworks.map((a) => a.targetName);
    console.warn(`[AR] No targetData found — falling back to target names:`, targetNames);
    XR8.XrController.configure({ imageTargets: targetNames });
  }

  // Create pipeline modules
  const sceneModule = createSceneModule();

  // Build the 8th Wall pipeline
  const pipelineModules = [
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule({
      enableLighting: true,
      enableWorldPoints: false,
      scale: 'responsive',
      disableWorldTracking: false,
    }),
    sceneModule,
  ];

  // Add XRExtras error handler if available
  if (typeof XRExtras !== 'undefined') {
    pipelineModules.push(XRExtras.RuntimeError.pipelineModule());
  }

  setLoadingProgress(70, 'Starting camera…');

  // Add pipeline modules
  for (const mod of pipelineModules) {
    XR8.addCameraPipelineModule(mod);
  }

  // Run 8th Wall
  XR8.run({ canvas });

  setLoadingProgress(90, 'Almost ready…');

  // Wait a tick for scene to initialize
  await new Promise((r) => setTimeout(r, 200));

  // Get scene refs and init interaction
  const { scene, camera } = getSceneRefs();
  initInteraction({ camera, canvas });

  setLoadingProgress(100, 'Ready');

  // Show scanning UI
  showScanning();

  // Debug overlay for mobile (no dev tools)
  const debugEl = document.createElement('div');
  debugEl.id = 'ar-debug';
  debugEl.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:rgba(0,0,0,0.7);color:#0f0;font:11px/1.4 monospace;padding:8px;max-height:30vh;overflow-y:auto;pointer-events:none;';
  document.body.appendChild(debugEl);

  // Debug toggle button
  const debugToggle = document.createElement('button');
  debugToggle.textContent = 'DBG';
  debugToggle.style.cssText = 'position:fixed;top:8px;left:8px;z-index:10000;background:rgba(0,0,0,0.6);color:#0f0;border:1px solid #0f0;font:bold 11px monospace;padding:6px 10px;border-radius:4px;cursor:pointer;-webkit-tap-highlight-color:transparent;';
  document.body.appendChild(debugToggle);
  debugToggle.addEventListener('click', () => {
    const hidden = debugEl.style.display === 'none';
    debugEl.style.display = hidden ? '' : 'none';
    debugToggle.style.opacity = hidden ? '1' : '0.4';
  });

  const debugLog = (msg) => {
    const line = document.createElement('div');
    line.textContent = `${new Date().toLocaleTimeString()} ${msg}`;
    debugEl.appendChild(line);
    debugEl.scrollTop = debugEl.scrollHeight;
  };

  debugLog(`XR8 loaded — ${imageTargetData.length} targets configured`);
  if (imageTargetData.length === 0) {
    debugLog('⚠ No image target data loaded! Add targetData to artworks.json');
  }

  // Hook into console to show [AR] messages on screen
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = (...args) => { origLog(...args); const m = args.join(' '); if (m.includes('[AR]')) debugLog(m); };
  console.warn = (...args) => { origWarn(...args); const m = args.join(' '); if (m.includes('[AR]')) debugLog('⚠ ' + m); };
  console.error = (...args) => { origError(...args); const m = args.join(' '); if (m.includes('[AR]')) debugLog('❌ ' + m); };
}
