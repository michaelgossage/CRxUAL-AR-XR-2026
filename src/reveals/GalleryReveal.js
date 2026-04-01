import * as THREE from 'three';
import RevealBase from './RevealBase.js';

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();

// Layout presets — add more as needed
const LAYOUTS = {
  // Single row, evenly spaced
  row: (count, spacing) => {
    const totalWidth = (count - 1) * spacing;
    return Array.from({ length: count }, (_, i) => ({
      x: -totalWidth / 2 + i * spacing,
      y: 0,
      z: 0,
    }));
  },
  // Arc arrangement facing camera
  arc: (count, spacing) => {
    const arcAngle = Math.min((count - 1) * 0.35, Math.PI * 0.6);
    return Array.from({ length: count }, (_, i) => {
      const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1; // -1 to 1
      const angle = t * arcAngle / 2;
      const radius = spacing * 1.5;
      return {
        x: Math.sin(angle) * radius,
        y: 0,
        z: -radius + Math.cos(angle) * radius,
        rotY: -angle,
      };
    });
  },
  // Stacked grid (2 columns)
  grid: (count, spacing) => {
    const cols = 2;
    return Array.from({ length: count }, (_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const totalCols = Math.min(count, cols);
      return {
        x: (col - (totalCols - 1) / 2) * spacing,
        y: -(row - (Math.ceil(count / cols) - 1) / 2) * spacing,
        z: 0,
      };
    });
  },
};

/**
 * GalleryReveal — displays a collection of images/videos on floating panels
 *
 * Config (from artworks.json):
 *   type: "gallery"
 *   panels: [
 *     { src: "./images/photo1.jpg", width: 0.3, height: 0.2, caption: "Optional" },
 *     { src: "./videos/clip.mp4",   width: 0.4, height: 0.3, autoplay: true },
 *   ]
 *   layout: "row" | "arc" | "grid"    (default: "row")
 *   spacing: 0.35                      (default: 0.35)
 *   scale: 1.0                         (default: 1)
 *   offset: [0, 0.15, 0]              (default: [0, 0.15, 0]) — also accepts legacy panelOffset
 */
export default class GalleryReveal extends RevealBase {
  constructor(opts) {
    super(opts);
    this.panelMeshes = [];
    this.videoElements = [];
    this.loaded = false;
  }

  async load() {
    const {
      panels = [],
      layout = 'row',
      spacing = 0.35,
      scale = 1,
      offset = [0, 0.15, 0],
      panelOffset,
    } = this.config;

    // panelOffset is legacy — fall back to offset
    const off = panelOffset || offset;

    if (panels.length === 0) {
      console.warn('[Gallery] No panels defined in config');
      return;
    }

    // Compute positions
    const layoutFn = LAYOUTS[layout] || LAYOUTS.row;
    const positions = layoutFn(panels.length, spacing);

    // Create each panel
    const loadPromises = panels.map((panelDef, i) =>
      this._createPanel(panelDef, positions[i])
    );

    const meshes = await Promise.all(loadPromises);

    // Offset group
    const container = new THREE.Group();
    container.position.set(off[0], off[1], off[2]);
    container.scale.setScalar(scale);

    for (const mesh of meshes) {
      if (mesh) {
        container.add(mesh);
        this.panelMeshes.push(mesh);
      }
    }

    this.root.add(container);
    this.loaded = true;
  }

  async _createPanel(panelDef, pos) {
    const {
      src,
      width = 0.3,
      height = 0.2,
      caption,
      autoplay = true,
      loop = true,
      borderColor = 0xe2b657,
      borderWidth = 0.005,
    } = panelDef;

    const isVideo = /\.(mp4|webm|mov)$/i.test(src);

    let material;

    if (isVideo) {
      material = this._createVideoMaterial(src, autoplay, loop);
    } else {
      const texture = await this._loadTexture(src);
      material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
      });
    }

    // Panel mesh
    const geo = new THREE.PlaneGeometry(width, height);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(pos.x, pos.y, pos.z);
    if (pos.rotY) mesh.rotation.y = pos.rotY;

    // Border frame
    const frame = this._createFrame(width, height, borderWidth, borderColor);
    mesh.add(frame);

    // Caption label below panel
    if (caption) {
      const label = this._createCaption(caption, width);
      label.position.set(0, -(height / 2 + 0.02), 0);
      mesh.add(label);
    }

    return mesh;
  }

  _loadTexture(src) {
    if (textureCache.has(src)) {
      return Promise.resolve(textureCache.get(src));
    }
    return new Promise((resolve, reject) => {
      textureLoader.load(
        src,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          textureCache.set(src, tex);
          resolve(tex);
        },
        undefined,
        (err) => {
          console.error(`[Gallery] Failed to load texture: ${src}`, err);
          reject(err);
        }
      );
    });
  }

  _createVideoMaterial(src, autoplay, loop) {
    const video = document.createElement('video');
    video.src = src;
    video.crossOrigin = 'anonymous';
    video.loop = loop;
    video.muted = true; // must be muted for autoplay
    video.playsInline = true;
    video.setAttribute('playsinline', '');

    if (autoplay) {
      video.play().catch((e) => console.warn('[Gallery] Autoplay blocked:', e));
    }

    this.videoElements.push(video);

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
  }

  _createFrame(width, height, borderWidth, color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });

    // top, bottom, left, right
    const bars = [
      { w: width + borderWidth * 2, h: borderWidth, x: 0, y: height / 2 + borderWidth / 2 },
      { w: width + borderWidth * 2, h: borderWidth, x: 0, y: -(height / 2 + borderWidth / 2) },
      { w: borderWidth, h: height, x: -(width / 2 + borderWidth / 2), y: 0 },
      { w: borderWidth, h: height, x: width / 2 + borderWidth / 2, y: 0 },
    ];

    for (const bar of bars) {
      const geo = new THREE.PlaneGeometry(bar.w, bar.h);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(bar.x, bar.y, 0.001); // slight z offset to sit in front
      group.add(mesh);
    }

    return group;
  }

  _createCaption(text, maxWidth) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontSize = 32;
    const padding = 8;

    canvas.width = 512;
    canvas.height = 64;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = '#e2b657';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const aspect = canvas.width / canvas.height;
    const labelHeight = 0.025;
    const labelWidth = labelHeight * aspect;

    const geo = new THREE.PlaneGeometry(Math.min(labelWidth, maxWidth), labelHeight);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    return new THREE.Mesh(geo, mat);
  }

  onTick(dt) {
    // VideoTexture auto-updates; nothing else needed for now
  }

  onDispose() {
    // Stop and clean up videos
    for (const video of this.videoElements) {
      video.pause();
      video.removeAttribute('src');
      video.load(); // release resources
    }
    this.videoElements = [];
    this.panelMeshes = [];
  }
}
