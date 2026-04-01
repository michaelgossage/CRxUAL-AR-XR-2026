import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import RevealBase from './RevealBase.js';

// Shared loaders (created once)
let gltfLoader = null;
let dracoLoader = null;

function getLoader() {
  if (!gltfLoader) {
    gltfLoader = new GLTFLoader();
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    gltfLoader.setDRACOLoader(dracoLoader);
  }
  return gltfLoader;
}

// Cache loaded models
const modelCache = new Map();

export default class ArtworkReveal extends RevealBase {
  constructor(opts) {
    super(opts);
    this.mixer = null;
    this.loaded = false;
  }

  _createFallbackBox(scale, offset) {
    console.log('[AR] Creating fallback box');
    const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe2b657, metalness: 0.3, roughness: 0.6 });
    const box = new THREE.Mesh(geo, mat);
    box.scale.setScalar(scale);
    box.position.set(offset[0], offset[1] + 0.1, offset[2]);
    return box;
  }

  async load() {
    const { model: modelUrl, scale = 0.5, offset = [0, 0, 0] } = this.config;

    let model;
    try {
      // Load or retrieve cached GLB
      let gltf;
      if (modelCache.has(modelUrl)) {
        gltf = modelCache.get(modelUrl);
        console.log(`[AR] Using cached model: ${modelUrl}`);
      } else {
        console.log(`[AR] Loading model: ${modelUrl}`);
        const loader = getLoader();
        gltf = await new Promise((resolve, reject) => {
          loader.load(
            modelUrl,
            resolve,
            (progress) => {
              if (progress.total) {
                console.log(`[AR] Model load progress: ${Math.round(progress.loaded / progress.total * 100)}%`);
              }
            },
            reject
          );
        });
        modelCache.set(modelUrl, gltf);
        console.log(`[AR] Model loaded OK — ${gltf.scene.children.length} children, ${gltf.animations?.length || 0} animations`);
      }

      // Clone the scene so cached model isn't consumed
      model = gltf.scene.clone();
      model.scale.setScalar(scale);
      model.position.set(offset[0], offset[1], offset[2]);

      // Ensure all materials support transparency for enter/exit animations
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((mat) => {
              mat.transparent = true;
              mat.depthWrite = true;
            });
          }
        }
      });

      // Set up animations if present
      if (gltf.animations && gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) {
          const action = this.mixer.clipAction(clip);
          action.play();
        }
      }
    } catch (err) {
      console.error(`[AR] Failed to load model "${modelUrl}":`, err);
      model = this._createFallbackBox(scale, offset);
    }

    this.root.add(model);
    this.model = model;

    this.loaded = true;
  }

  onTick(dt) {
    if (this.mixer) {
      this.mixer.update(dt);
    }
  }

  onDispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
  }
}

