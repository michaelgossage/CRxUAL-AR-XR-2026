// Touch interaction — tap, drag, pinch
import * as THREE from 'three';
import { getActiveReveal } from './targets.js';

let camera = null;
let canvas = null;

// Pointer state
let isDown = false;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;
const TAP_SLOP = 8; // px threshold to distinguish tap from drag

// Pinch state
let pinchStartDist = 0;
let pinchStartScale = 1;
let isPinching = false;

export function initInteraction({ camera: cam, canvas: cvs }) {
  camera = cam;
  canvas = cvs;

  // Touch events
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: true });
  canvas.addEventListener('touchend', onTouchEnd, { passive: true });

  // Mouse fallback (for testing)
  canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerup', onPointerUp, { passive: true });
}

function onTouchStart(e) {
  if (e.touches.length === 2) {
    isPinching = true;
    pinchStartDist = getTouchDist(e.touches);
    const reveal = getActiveReveal();
    if (reveal && reveal.root) {
      pinchStartScale = reveal.root.scale.x;
    }
    return;
  }

  if (e.touches.length === 1) {
    const t = e.touches[0];
    startDown(t.clientX, t.clientY);
  }
}

function onTouchMove(e) {
  if (isPinching && e.touches.length === 2) {
    const dist = getTouchDist(e.touches);
    const scaleFactor = dist / pinchStartDist;
    const reveal = getActiveReveal();
    if (reveal && reveal.mode === 'free' && reveal.root) {
      const newScale = Math.max(0.1, Math.min(3, pinchStartScale * scaleFactor));
      reveal.root.scale.setScalar(newScale);
    }
    return;
  }

  if (e.touches.length === 1) {
    const t = e.touches[0];
    handleDrag(t.clientX, t.clientY);
  }
}

function onTouchEnd(e) {
  if (isPinching) {
    isPinching = false;
    return;
  }
  endDown();
}

function onPointerDown(e) {
  startDown(e.clientX, e.clientY);
}

function onPointerMove(e) {
  if (isDown) handleDrag(e.clientX, e.clientY);
}

function onPointerUp() {
  endDown();
}

function startDown(x, y) {
  isDown = true;
  startX = x;
  startY = y;
  lastX = x;
  lastY = y;
}

function handleDrag(x, y) {
  if (!isDown) return;
  const dx = x - lastX;
  const dy = y - lastY;
  lastX = x;
  lastY = y;

  const totalDx = x - startX;
  const totalDy = y - startY;
  const totalDist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);

  // Allow rotation drag past slop threshold — except carousel reveals use swipe navigation
  if (totalDist > TAP_SLOP) {
    const reveal = getActiveReveal();
    if (reveal && reveal.root && !reveal._carousel) {
      reveal.root.rotation.y += dx * 0.005;
    }
  }
}

function endDown() {
  if (!isDown) return;
  isDown = false;

  const totalDx = lastX - startX;
  const totalDy = lastY - startY;
  const totalDist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);

  if (totalDist <= TAP_SLOP) {
    handleTap(lastX, lastY);
  } else {
    // Route horizontal swipe to carousel navigation
    const reveal = getActiveReveal();
    if (reveal && reveal._carousel && Math.abs(totalDx) > Math.abs(totalDy) * 1.2) {
      reveal.navigate(totalDx < 0 ? 1 : -1);
    }
  }
}

function handleTap(x, y) {
  // Tap handling reserved for future interaction
}

function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
