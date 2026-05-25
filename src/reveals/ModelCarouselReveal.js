import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import RevealBase from './RevealBase.js';
import { dampValue } from '../utils.js';

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

const modelCache = new Map();

const FALLBACK_COLOR = 0xe2b657;
const FOCUSED_SCALE = 1.0;
const UNFOCUSED_SCALE = 0.55;
const RING_DAMP = 10;
const SCALE_LERP = 10;
const DEFAULT_SPIN_SPEED = 0.4; // rad/s — approx one full rotation every 15 seconds

export default class ModelCarouselReveal extends RevealBase {
  constructor(opts) {
    super(opts);
    this._ring = new THREE.Group();
    this.root.add(this._ring);
    this._modelGroups = [];
    this._mixers = [];
    this._currentIndex = 0;
    this._targetAngle = 0;
    this._currentAngle = 0;
    // Invisible per-model hitboxes — exposed for interaction.js drag detection
    this.modelHitboxes = [];
  }

  async load() {
    const { items = [] } = this.config;
    if (items.length === 0) return;

    await Promise.all(items.map((item, i) => this._loadItem(item, i, items.length)));

    this._applyScales(1);
    await this._initOverlay();
    console.log(`[AR] ModelCarousel loaded ${items.length} models`);
  }

  async _loadItem(item, index, total) {
    const { model: modelUrl, scale = 0.5, offset: itemOffset = [0, 0, 0] } = item;
    const { radius = 0.7, offset: cfgOffset = [0, 0, 0] } = this.config;

    const angle = (2 * Math.PI * index) / total;
    const group = new THREE.Group();
    group.position.set(
      radius * Math.sin(angle),
      cfgOffset[1] + itemOffset[1],
      -radius * Math.cos(angle),
    );
    group.rotation.y = Math.PI - angle; // face outward (local +Z away from ring centre)
    group.userData.ringAngle = angle;   // stored for auto-spin counter-rotation

    let model;
    try {
      let gltf;
      if (modelCache.has(modelUrl)) {
        gltf = modelCache.get(modelUrl);
      } else {
        console.log(`[AR] Carousel loading model ${index + 1}/${total}: ${modelUrl}`);
        const loader = getLoader();
        gltf = await new Promise((resolve, reject) => {
          loader.load(modelUrl, resolve, undefined, reject);
        });
        modelCache.set(modelUrl, gltf);
      }

      model = gltf.scene.clone();
      model.scale.setScalar(scale);
      model.position.set(itemOffset[0], 0, itemOffset[2]);

      const materialOverride = this.config.materialOverride;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
          if (materialOverride === 'silver') {
            const makesSilver = () => new THREE.MeshStandardMaterial({
              color: 0xd0d0d0,
              metalness: 0.95,
              roughness: 0.08,
              transparent: true,
              depthWrite: true,
            });
            child.material = Array.isArray(child.material)
              ? child.material.map(makesSilver)
              : makesSilver();
          } else if (materialOverride === 'cream') {
            const makesCream = () => new THREE.MeshStandardMaterial({
              color: 0xf2ebe0,
              metalness: 0.0,
              roughness: 0.92,
              transparent: true,
              depthWrite: true,
            });
            child.material = Array.isArray(child.material)
              ? child.material.map(makesCream)
              : makesCream();
          } else if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((mat) => { mat.transparent = true; mat.depthWrite = true; });
          }
        }
      });

      if (gltf.animations?.length > 0) {
        const mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) mixer.clipAction(clip).play();
        this._mixers[index] = mixer;
      }
    } catch (err) {
      console.error(`[AR] Carousel failed to load "${modelUrl}":`, err);
      const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
      const mat = new THREE.MeshStandardMaterial({ color: FALLBACK_COLOR, metalness: 0.3, roughness: 0.6 });
      model = new THREE.Mesh(geo, mat);
      model.scale.setScalar(scale);
    }

    group.add(model);

    // Invisible hitbox for drag detection — covers ~30cm radius around this model slot
    const hitGeo = new THREE.SphereGeometry(0.3, 6, 6);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const hitbox = new THREE.Mesh(hitGeo, hitMat);
    hitbox.userData.isOverlay = true; // exempt from RevealBase._setOpacity
    group.add(hitbox);
    this.modelHitboxes[index] = hitbox;

    this._ring.add(group);
    this._modelGroups[index] = group;
  }

  get autoSpin() {
    return !!this.config.autoSpin;
  }

  navigate(dir) {
    if (this.autoSpin) return; // navigation handled by continuous rotation
    const n = this._modelGroups.length;
    if (n === 0) return;
    this._currentIndex = (this._currentIndex + dir + n) % n;
    this._targetAngle = -(2 * Math.PI * this._currentIndex) / n;
  }

  // Called by interaction.js during drag for auto-spin reveals
  rotateDelta(dx) {
    this._currentAngle += dx * 0.005;
    this._ring.rotation.y = this._currentAngle;
  }

  get _focusedModel() {
    return this.autoSpin ? null : (this._modelGroups[this._currentIndex] || null);
  }

  _applyScales(speed) {
    for (let i = 0; i < this._modelGroups.length; i++) {
      const group = this._modelGroups[i];
      if (!group) continue;
      // Auto-spin: all models equal size — no focal highlight
      const target = (this.autoSpin || i === this._currentIndex) ? FOCUSED_SCALE : UNFOCUSED_SCALE;
      const current = group.scale.x;
      group.scale.setScalar(current + (target - current) * speed);
    }
  }

  onTick(dt) {
    if (this.autoSpin) {
      const speed = this.config.spinSpeed || DEFAULT_SPIN_SPEED;
      this._currentAngle += speed * dt;
      this._ring.rotation.y = this._currentAngle;
      // Counter-rotate each model so it stays facing outward as the ring turns
      for (const group of this._modelGroups) {
        if (!group) continue;
        group.rotation.y = Math.PI - group.userData.ringAngle - 2 * this._currentAngle;
      }
    } else {
      this._currentAngle = dampValue(this._currentAngle, this._targetAngle, RING_DAMP, dt);
      this._ring.rotation.y = this._currentAngle;
    }

    this._applyScales(Math.min(1, SCALE_LERP * dt));

    for (const mixer of this._mixers) {
      if (mixer) mixer.update(dt);
    }
  }

  onDispose() {
    for (const mixer of this._mixers) {
      if (mixer) mixer.stopAllAction();
    }
    this._mixers = [];
  }
}
