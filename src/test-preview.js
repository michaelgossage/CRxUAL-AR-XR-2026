import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import createReveal from './reveals/createReveal.js';

// ── State ─────────────────────────────────────────────────────────────────────
let artworks = [];
let currentIndex = -1;
let activeReveal = null;
let exitingReveals = [];

// ── Three.js refs ─────────────────────────────────────────────────────────────
let scene, camera, renderer, controls, anchorGroup;
const clock = new THREE.Clock();

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function resolveUrl(path) {
  if (path?.startsWith('./')) return import.meta.env.BASE_URL + path.slice(2);
  return path;
}

function normalizeConfig(raw) {
  const c = { ...raw, showOverlay: false };
  if (c.targetData) c.targetData = resolveUrl(c.targetData);
  if (c.model)      c.model      = resolveUrl(c.model);
  if (c.panels)     c.panels     = c.panels.map(p => ({ ...p, src: resolveUrl(p.src) }));
  if (c.items)      c.items      = c.items.map(it => ({ ...it, model: resolveUrl(it.model) }));
  return c;
}

// ── Data ──────────────────────────────────────────────────────────────────────
async function loadArtworks() {
  const res = await fetch(import.meta.env.BASE_URL + 'data/artworks.json');
  artworks = (await res.json()).map(normalizeConfig);
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function initScene() {
  const canvas = $('preview-canvas');
  const container = canvas.parentElement;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x0a0514, 1);

  scene = new THREE.Scene();

  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h, false);

  camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 100);
  camera.position.set(0, 0.5, 2.5);

  // Mirrors the 3-light setup in src/scene.js
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  hemi.position.set(0, 1, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(0.5, 1, 0.3);
  scene.add(dir);

  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  anchorGroup = new THREE.Group();
  scene.add(anchorGroup);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0.5, 0);
  controls.minDistance = 0.3;
  controls.maxDistance = 12;
  controls.update();

  new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }).observe(container);
}

// ── Render loop ───────────────────────────────────────────────────────────────
function startLoop() {
  clock.start();
  (function loop() {
    requestAnimationFrame(loop);
    const dt = clock.getDelta();
    for (let i = exitingReveals.length - 1; i >= 0; i--) {
      exitingReveals[i].tick(dt);
      if (exitingReveals[i].isDisposed) exitingReveals.splice(i, 1);
    }
    activeReveal?.tick(dt);
    controls.update();
    renderer.render(scene, camera);
  })();
}

// ── Camera reset ──────────────────────────────────────────────────────────────
function resetCamera(config) {
  const [ox = 0, oy = 0, oz = 0] = config.offset || [0, 0, 0];
  controls.target.set(ox, oy, oz);
  camera.position.set(ox, oy + 0.3, oz + 2.5);
  controls.update();
}

// ── Artwork loading ───────────────────────────────────────────────────────────
async function loadArtwork(index) {
  setLoading(true);

  if (activeReveal) {
    activeReveal.exit();
    exitingReveals.push(activeReveal);
    activeReveal = null;
  }

  const config = artworks[index];
  const reveal = createReveal({ scene, camera, anchorGroup, config, physicalWidth: 0.3 });
  activeReveal = reveal;

  resetCamera(config);

  try {
    await reveal.load();
    if (activeReveal !== reveal) { reveal.dispose(); return; }
    reveal.enter();
    setLoading(false);
    updateInfoBar(config, reveal);
  } catch (err) {
    console.error('[Preview] Load failed:', err);
    if (activeReveal === reveal) { activeReveal = null; setLoading(false); }
  }
}

// ── Artwork navigation ────────────────────────────────────────────────────────
function selectArtwork(index) {
  if (index === currentIndex) return;
  currentIndex = index;
  updateSidebar(index);
  updateCounter();
  loadArtwork(index);
}

function prevArtwork() { selectArtwork((currentIndex - 1 + artworks.length) % artworks.length); }
function nextArtwork() { selectArtwork((currentIndex + 1) % artworks.length); }

// ── UI ────────────────────────────────────────────────────────────────────────
function setLoading(on) {
  $('loading-overlay').style.display = on ? 'flex' : 'none';
}

function updateCounter() {
  $('artwork-counter').textContent = `${currentIndex + 1} / ${artworks.length}`;
}

function updateInfoBar(config, reveal) {
  $('info-title').textContent = config.title || '';
  $('info-meta').textContent = [config.artist, config.year].filter(Boolean).join(' · ');
  $('info-description').textContent = config.description || '';

  const type = config.type || 'model';
  const hasNav = (type === 'gallery' || type === 'model-carousel')
    && !config.autoSpin
    && typeof reveal.navigate === 'function';

  const innerNav = $('inner-nav');
  innerNav.style.display = hasNav ? 'flex' : 'none';
  if (hasNav) {
    $('inner-prev').onclick = () => reveal.navigate(-1);
    $('inner-next').onclick = () => reveal.navigate(1);
  }
}

function updateSidebar(activeIdx) {
  document.querySelectorAll('.artwork-item').forEach((el, i) => {
    el.classList.toggle('active', i === activeIdx);
    if (i === activeIdx) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function buildSidebar() {
  const list = $('artwork-list');
  artworks.forEach((aw, i) => {
    const btn = document.createElement('button');
    btn.className = 'artwork-item';
    const type = aw.type || 'model';
    btn.innerHTML = `
      <span class="item-title">${aw.title}</span>
      <span class="item-artist">${aw.artist}</span>
      <span class="item-badge badge-${type.replace('-', '')}">${type}</span>
    `;
    btn.addEventListener('click', () => selectArtwork(i));
    list.appendChild(btn);
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadArtworks();
  initScene();
  buildSidebar();

  $('artwork-prev').addEventListener('click', prevArtwork);
  $('artwork-next').addEventListener('click', nextArtwork);

  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft')  prevArtwork();
    if (e.key === 'ArrowRight') nextArtwork();
    if (e.key === 'ArrowUp'   && activeReveal?.navigate) activeReveal.navigate(-1);
    if (e.key === 'ArrowDown'  && activeReveal?.navigate) activeReveal.navigate(1);
  });

  startLoop();
  selectArtwork(0);
}

init().catch(console.error);
