import * as THREE from 'three';

// Math helpers
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Easing functions
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Exponential damping — call per frame for buttery interpolation
// factor: 0 = instant, higher = slower (typical: 5-15)
export function dampValue(current, target, factor, dt) {
  return lerp(current, target, 1 - Math.exp(-factor * dt));
}

export function dampVector3(current, target, factor, dt) {
  const t = 1 - Math.exp(-factor * dt);
  current.lerp(target, t);
  return current;
}

export function dampQuaternion(current, target, factor, dt) {
  const t = 1 - Math.exp(-factor * dt);
  current.slerp(target, t);
  return current;
}

// Capture world transform from an Object3D
export function captureWorldTransform(obj) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  obj.matrixWorld.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

// Apply world transform to an Object3D that's a child of scene root
export function applyWorldTransform(obj, { position, quaternion, scale }) {
  obj.position.copy(position);
  obj.quaternion.copy(quaternion);
  obj.scale.copy(scale);
}

// Dispose Three.js resources recursively
export function disposeObject(obj) {
  if (!obj) return;

  obj.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        for (const key of Object.keys(mat)) {
          const value = mat[key];
          if (value && typeof value.dispose === 'function') {
            value.dispose();
          }
        }
        mat.dispose();
      }
    }
  });
}

// Check if device is mobile
export function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && /Macintosh/i.test(navigator.userAgent));
}
