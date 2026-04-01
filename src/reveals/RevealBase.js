import * as THREE from 'three';
import {
  lerp, easeOutCubic, easeOutQuart, dampVector3, dampQuaternion,
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

export default class RevealBase {
  constructor({ scene, camera, anchorGroup, config }) {
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
  }

  enter() {
    if (this.state === DISPOSED) return;
    this.state = ENTERING;
    this.stateTime = 0;
    this.root.visible = true;
    this.root.scale.setScalar(0.001);
    this._setOpacity(0);
  }

  exit() {
    if (this.state === DISPOSED || this.state === EXITING) return;
    this.state = EXITING;
    this.stateTime = 0;
  }

  tick(dt) {
    if (this.state === DISPOSED || this.state === IDLE) return;

    this.stateTime += dt;

    if (this.state === ENTERING) {
      const t = Math.min(this.stateTime / ENTER_DURATION, 1);
      const eased = easeOutCubic(t);
      this.root.scale.setScalar(lerp(0.001, 1, eased));
      this._setOpacity(eased);
      if (t >= 1) {
        this.state = ACTIVE;
        this.stateTime = 0;
      }
    }

    if (this.state === EXITING) {
      const t = Math.min(this.stateTime / EXIT_DURATION, 1);
      const eased = easeOutQuart(t);
      this.root.scale.setScalar(lerp(1, 0.8, eased));
      this._setOpacity(1 - eased);
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
      // Stay in scene space during interpolation, then reparent when close
      this._targetPosition.set(0, 0, 0);
      this._targetQuaternion.identity();

      // For now, reparent immediately and interpolate in local space
      const worldTransform = captureWorldTransform(this.root);
      this.scene.remove(this.root);
      this.anchorGroup.add(this.root);

      // Convert world position to anchor-local position
      const anchorWorldInverse = new THREE.Matrix4().copy(this.anchorGroup.matrixWorld).invert();
      const localPos = worldTransform.position.applyMatrix4(anchorWorldInverse);
      this.root.position.copy(localPos);

      // Convert world quaternion to anchor-local quaternion
      const anchorWorldQuat = new THREE.Quaternion();
      this.anchorGroup.matrixWorld.decompose(new THREE.Vector3(), anchorWorldQuat, new THREE.Vector3());
      const localQuat = anchorWorldQuat.invert().multiply(worldTransform.quaternion);
      this.root.quaternion.copy(localQuat);

      this.mode = TRACKED;
      this._reacquiring = true;
    }
  }

  _setOpacity(value) {
    this.root.traverse((child) => {
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
