import * as THREE from 'three';
import {
  lerp, easeOutCubic, easeOutBack, easeOutQuart, dampVector3, dampQuaternion,
  captureWorldTransform, applyWorldTransform, disposeObject,
} from '../utils.js';

// States
const IDLE = 'idle';
const ENTERING = 'entering';
const ACTIVE = 'active';
const EXITING = 'exiting';
const DISPOSED = 'disposed';

// Modes
const TRACKED = 'tracked';
const FREE = 'free';

const ENTER_DURATION = 0.8;
const EXIT_DURATION = 0.4;
const REACQUIRE_DAMPING = 8; // exponential damping factor
const OVERLAY_FILL_DELAY = 0.2;    // seconds before overlay starts fading in
const OVERLAY_FILL_DURATION = 2.0; // seconds to reach full opacity

export default class RevealBase {
  constructor({ scene, camera, anchorGroup, config, physicalWidth }) {
    this.scene = scene;
    this.camera = camera;
    this.anchorGroup = anchorGroup;
    this.config = config;

    // Content root — all reveal content goes inside this
    this.root = new THREE.Group();
    this.root.visible = false;
    this.anchorGroup.add(this.root);

    this.state = IDLE;
    this.mode = TRACKED;
    this.stateTime = 0;

    // For free→tracked interpolation
    this._reacquiring = false;
    this._targetPosition = new THREE.Vector3();
    this._targetQuaternion = new THREE.Quaternion();

    // Tracking image overlay
    this._physicalWidth = physicalWidth || null;
    this._overlayPlane = null;
    this._overlayTime = 0;
    this._overlayPeakOpacity = 0;
  }

  enter() {
    if (this.state === DISPOSED) return;
    this.state = ENTERING;
    this.stateTime = 0;
    this.root.visible = true;
    this.root.scale.setScalar(0.001);
    this._setOpacity(0);
    this._overlayTime = 0;
  }

  exit() {
    if (this.state === DISPOSED || this.state === EXITING) return;
    this.state = EXITING;
    this.stateTime = 0;
    this._overlayPeakOpacity = this._overlayPlane ? this._overlayPlane.material.opacity : 0;
  }

  tick(dt) {
    if (this.state === DISPOSED || this.state === IDLE) return;

    this.stateTime += dt;

    if (this.state === ENTERING) {
      const t = Math.min(this.stateTime / ENTER_DURATION, 1);
      const eased = easeOutBack(t);
      this.root.scale.setScalar(lerp(0.001, 1, eased));
      this._setOpacity(eased);
      this._tickOverlay(dt);
      if (t >= 1) {
        this.state = ACTIVE;
        this.stateTime = 0;
      }
    } else if (this.state === ACTIVE) {
      if (this._overlayPlane && this._overlayPlane.material.opacity < 1) {
        this._tickOverlay(dt);
      }
    }

    if (this.state === EXITING) {
      const t = Math.min(this.stateTime / EXIT_DURATION, 1);
      const eased = easeOutQuart(t);
      this.root.scale.setScalar(lerp(1, 0.8, eased));
      this._setOpacity(1 - eased);
      if (this._overlayPlane) {
        this._overlayPlane.material.opacity = this._overlayPeakOpacity * (1 - eased);
      }
      if (t >= 1) {
        this.dispose();
        return;
      }
    }

    // Smooth re-acquisition interpolation
    if (this._reacquiring && this.mode === TRACKED) {
      dampVector3(this.root.position, this._targetPosition, REACQUIRE_DAMPING, dt);
      dampQuaternion(this.root.quaternion, this._targetQuaternion, REACQUIRE_DAMPING, dt);

      const dist = this.root.position.distanceTo(this._targetPosition);
      if (dist < 0.001) {
        this.root.position.copy(this._targetPosition);
        this.root.quaternion.copy(this._targetQuaternion);
        this._reacquiring = false;
      }
    }

    this.onTick(dt);
  }

  // Override in subclass
  onTick(dt) {}

  switchToFree() {
    if (this.mode === FREE) return;

    // Capture world transform before reparenting
    const worldTransform = captureWorldTransform(this.root);

    // Reparent to scene root
    this.anchorGroup.remove(this.root);
    this.scene.add(this.root);

    // Apply captured world transform
    applyWorldTransform(this.root, worldTransform);

    this.mode = FREE;
    this._reacquiring = false;
  }

  switchToTracked(anchorGroup) {
    if (anchorGroup) {
      this.anchorGroup = anchorGroup;
    }

    if (this.mode === TRACKED && !this._reacquiring) {
      return;
    }

    if (this.mode === FREE) {
      const worldTransform = captureWorldTransform(this.root);
      this.scene.remove(this.root);
      this.anchorGroup.add(this.root);

      // Use anchor's local position/quaternion directly — matrixWorld is stale until
      // the next render pass, but local = world since anchor is a direct scene child.
      const anchorPos = this.anchorGroup.position;
      const anchorQuat = this.anchorGroup.quaternion;

      // Convert world position to anchor-local (anchor has no scale)
      const localPos = worldTransform.position.clone()
        .sub(anchorPos)
        .applyQuaternion(anchorQuat.clone().invert());
      this.root.position.copy(localPos);

      // Convert world quaternion to anchor-local, preserve user's spin
      const localQuat = anchorQuat.clone().invert().multiply(worldTransform.quaternion);
      this.root.quaternion.copy(localQuat);

      // Damp both position and rotation back to anchor-aligned defaults
      this._targetPosition.set(0, 0, 0);
      this._targetQuaternion.identity();

      this.mode = TRACKED;
      this._reacquiring = true;
    }
  }

  _setOpacity(value) {
    this.root.traverse((child) => {
      if (child.userData.isOverlay) return;
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          mat.transparent = true;
          mat.opacity = value;
          mat.needsUpdate = true;
        }
      }
    });
  }

  _tickOverlay(dt) {
    if (!this._overlayPlane) return;
    this._overlayTime += dt;
    const ot = Math.max(0, Math.min(
      (this._overlayTime - OVERLAY_FILL_DELAY) / OVERLAY_FILL_DURATION, 1,
    ));
    this._overlayPlane.material.opacity = ot;
  }

  async _initOverlay() {
    if (!this.config.showOverlay) return;
    if (!this._physicalWidth || !this.config.targetData) return;
    const imageUrl = this.config.targetData.replace('.json', '_original.jpg');

    return new Promise((resolve) => {
      new THREE.TextureLoader().load(
        imageUrl,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          const aspect = texture.image.naturalWidth / texture.image.naturalHeight;
          const w = this._physicalWidth;
          const h = w / aspect;
          const geo = new THREE.PlaneGeometry(w, h);
          const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          });
          const plane = new THREE.Mesh(geo, mat);
          plane.position.z = 0.001;
          plane.userData.isOverlay = true;
          this.root.add(plane);
          this._overlayPlane = plane;
          resolve();
        },
        undefined,
        () => resolve(),
      );
    });
  }

  dispose() {
    if (this.state === DISPOSED) return;
    this.state = DISPOSED;

    if (this.root.parent) {
      this.root.parent.remove(this.root);
    }
    disposeObject(this.root);
    this.onDispose();
  }

  // Override in subclass
  onDispose() {}

  get isActive() {
    return this.state === ENTERING || this.state === ACTIVE;
  }

  get isExiting() {
    return this.state === EXITING;
  }

  get isDisposed() {
    return this.state === DISPOSED;
  }
}
