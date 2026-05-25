import * as THREE from 'three';
import RevealBase from './RevealBase.js';

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();

const PANEL_THICKNESS = 0.008; // 8 mm — physical canvas depth

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
  // Carousel — panels on a cylindrical arc curving toward the camera.
  // curve=0 → flat row; curve=1 → strong wrap (~144° arc).
  // The _arcWrapper group rotates around the arc centre to bring active panel forward.
  carousel: (count, spacing, curve = 0) => {
    if (curve < 0.001 || count <= 1) {
      return Array.from({ length: count }, (_, i) => ({
        x: i * spacing, y: 0, z: 0,
      }));
    }
    const arcAngle = curve * Math.PI * 0.8;           // 0 → ~144°
    const totalWidth = (count - 1) * spacing;
    const radius = (totalWidth / 2) / Math.sin(arcAngle / 2);
    return Array.from({ length: count }, (_, i) => {
      const t = (i / (count - 1)) - 0.5;             // -0.5 … +0.5
      const angle = t * arcAngle;
      return {
        x: radius * Math.sin(angle),
        y: 0,
        z: radius * (1 - Math.cos(angle)),            // positive → toward camera
        rotY: -angle,
        _angle: angle,                                // stored for navigation
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
 *   layout: "row" | "arc" | "grid" | "carousel"  (default: "row")
 *   spacing: 0.35                      (default: 0.35)
 *   curve: 0.5                         (carousel only — arc curvature 0=flat … 1=~144° wrap, default: 0)
 *   dotsY: -0.18                       (carousel only — dot indicator Y offset, default: -0.18)
 *   scale: 1.0                         (default: 1)
 *   offset: [0, 0.15, 0]              (default: [0, 0.15, 0]) — also accepts legacy panelOffset
 */
export default class GalleryReveal extends RevealBase {
  constructor(opts) {
    super(opts);
    this.panelMeshes = [];
    this.videoElements = [];
    this.loaded = false;

    // Carousel state — null when layout !== 'carousel'
    this._carousel = null;
    this._track = null;
    this._arcWrapper = null;  // non-null only when curve > 0
    this._dotMeshes = [];
    this._carouselSpacing = 0;
    this._floatTime = 0;
  }

  async load() {
    const {
      panels = [],
      layout = 'row',
      spacing = 0.35,
      curve = 0,
      scale = 1,
      offset = [0, 0.15, 0],
      panelOffset,
      dotsY = -0.18,
    } = this.config;

    // panelOffset is legacy — fall back to offset
    const off = panelOffset || offset;

    if (panels.length === 0) {
      console.warn('[Gallery] No panels defined in config');
      return;
    }

    // Compute positions (carousel passes curve for arc layout)
    const layoutFn = LAYOUTS[layout] || LAYOUTS.row;
    const positions = layout === 'carousel'
      ? layoutFn(panels.length, spacing, curve)
      : layoutFn(panels.length, spacing);

    // Create each panel
    const loadPromises = panels.map((panelDef, i) =>
      this._createPanel(panelDef, positions[i])
    );

    const meshes = await Promise.all(loadPromises);

    // Offset group
    const container = new THREE.Group();
    container.position.set(off[0], off[1], off[2]);
    container.scale.setScalar(scale);

    if (layout === 'carousel') {
      this._track = new THREE.Group();

      const isCurved = curve > 0.001 && panels.length > 1;

      if (isCurved) {
        const arcAngle = curve * Math.PI * 0.8;
        const totalWidth = (panels.length - 1) * spacing;
        const radius = (totalWidth / 2) / Math.sin(arcAngle / 2);
        // Arc centre is at +z (toward camera). arcWrapper pivots there; track
        // is offset back so the track origin sits at z=0 in container space.
        this._arcWrapper = new THREE.Group();
        this._arcWrapper.position.z = radius;
        this._track.position.z = -radius;
        this._arcWrapper.add(this._track);
        container.add(this._arcWrapper);

        // Store per-panel angles for navigation (extracted from layout positions)
        const panelAngles = positions.map(p => p._angle ?? 0);
        // Start with panel 0 already at the front (no initial sweep animation)
        const initialAngle = panelAngles[0];
        this._arcWrapper.rotation.y = initialAngle;
        this._carousel = { index: 0, targetAngle: initialAngle, panelAngles, curveRadius: radius };
      } else {
        container.add(this._track);
        this._carousel = { index: 0, targetX: 0, curveRadius: 0 };
      }

      for (const mesh of meshes) {
        if (mesh) {
          this._track.add(mesh);
          this.panelMeshes.push(mesh);
        }
      }

      this._carouselSpacing = spacing;

      if (panels.length > 1) {
        container.add(this._createDots(panels.length, dotsY));
      }
    } else {
      for (const mesh of meshes) {
        if (mesh) {
          container.add(mesh);
          this.panelMeshes.push(mesh);
        }
      }
    }

    this.root.add(container);
    this.loaded = true;
  }

  /** Build dot indicator strip for the carousel */
  _createDots(count, dotsY) {
    const group = new THREE.Group();
    group.position.set(0, dotsY, 0.001);
    const DOT_SPACING = 0.022;
    const DOT_RADIUS = 0.007;

    for (let i = 0; i < count; i++) {
      const geo = new THREE.CircleGeometry(DOT_RADIUS, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0xffffff : 0x555555,
        transparent: true,
      });
      const dot = new THREE.Mesh(geo, mat);
      dot.position.x = (i - (count - 1) / 2) * DOT_SPACING;
      group.add(dot);
      this._dotMeshes.push(dot);
    }

    return group;
  }

  /** Advance the carousel by +1 (next) or -1 (prev) */
  navigate(dir) {
    if (!this._carousel) return;
    const count = this.panelMeshes.length;
    const newIndex = Math.max(0, Math.min(count - 1, this._carousel.index + dir));
    if (newIndex === this._carousel.index) return;
    this._carousel.index = newIndex;
    if (this._carousel.curveRadius > 0) {
      // Rotate arc wrapper by +θ to bring panel at angle θ to the front.
      // Proof: panel i sits at (R·sin θ, 0, -R·cos θ) in arcWrapper local space;
      // Y-rotation by +θ maps that to (0, 0, -R) = the front slot. ✓
      this._carousel.targetAngle = this._carousel.panelAngles[newIndex];
    } else {
      this._carousel.targetX = -newIndex * this._carouselSpacing;
    }
    this._dotMeshes.forEach((dot, i) => {
      dot.material.color.set(i === newIndex ? 0xffffff : 0x555555);
    });
  }

  async _createPanel(panelDef, pos) {
    const {
      src,
      width,
      height,
      caption,
      autoplay = true,
      loop = true,
      borderColor = 0xffffff,
      borderWidth = 0.005,
    } = panelDef;

    const isVideo = /\.(mp4|webm|mov)$/i.test(src);

    let material;
    let finalWidth, finalHeight;

    if (isVideo) {
      material = this._createVideoMaterial(src, autoplay, loop);
      finalWidth = width ?? 0.3;
      finalHeight = height ?? 0.2;
    } else {
      const texture = await this._loadTexture(src);
      material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const aspect = texture.image.width / texture.image.height;
      if (width != null && height != null) {
        finalWidth = width;
        finalHeight = height;
      } else if (width != null) {
        finalWidth = width;
        finalHeight = width / aspect;
      } else if (height != null) {
        finalHeight = height;
        finalWidth = height * aspect;
      } else {
        finalWidth = 0.3;
        finalHeight = 0.3 / aspect;
      }
    }

    // Panel mesh — BoxGeometry gives physical thickness; front face (+Z, index 4) gets the image
    const geo = new THREE.BoxGeometry(finalWidth, finalHeight, PANEL_THICKNESS);
    const sideMat = new THREE.MeshStandardMaterial({
      color: 0xf0ede8,
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
    });
    const mesh = new THREE.Mesh(geo, [sideMat, sideMat, sideMat, sideMat, material, sideMat]);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.userData.baseY = pos.y;
    mesh.userData.floatPhase = this.panelMeshes.length * 0.9;
    if (pos.rotY) mesh.rotation.y = pos.rotY;

    // Border frame
    const frame = this._createFrame(finalWidth, finalHeight, borderWidth, borderColor);
    mesh.add(frame);

    // Caption label below panel
    if (caption) {
      const label = this._createCaption(caption, finalWidth);
      label.position.set(0, -(finalHeight / 2 + 0.02), 0);
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
      mesh.position.set(bar.x, bar.y, PANEL_THICKNESS / 2 + 0.001);
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
    if (this._carousel && this._track) {
      const speed = Math.min(1, 12 * dt);
      if (this._carousel.curveRadius > 0 && this._arcWrapper) {
        // Rotate the arc wrapper to bring the active panel forward
        this._arcWrapper.rotation.y +=
          (this._carousel.targetAngle - this._arcWrapper.rotation.y) * speed;
      } else {
        // Flat carousel: slide track along X
        this._track.position.x +=
          (this._carousel.targetX - this._track.position.x) * speed;
      }
    }

    this._floatTime += dt;
    for (let i = 0; i < this.panelMeshes.length; i++) {
      const panel = this.panelMeshes[i];
      panel.position.y =
        panel.userData.baseY +
        Math.sin(this._floatTime * 0.6 + panel.userData.floatPhase) * 0.012;
    }
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
    this._dotMeshes = [];
    this._track = null;
    this._arcWrapper = null;
    this._carousel = null;
  }
}
