import * as THREE from 'three';
import RevealBase from './RevealBase.js';

const PANEL_THICKNESS = 0.008;

const PLAY_ICON     = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`;
const PAUSE_ICON    = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="3" width="4" height="18"/><rect x="14" y="3" width="4" height="18"/></svg>`;
const MUTED_ICON    = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const UNMUTED_ICON  = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const FS_ENTER_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
const FS_EXIT_ICON  = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`;

export default class VideoReveal extends RevealBase {
  constructor(opts) {
    super(opts);
    this._video = null;
    this.panelMesh = null;
    this._controls = null;
    this._playBtn = null;
    this._muteBtn = null;
    this._fsBtn = null;
    this._floatTime = 0;
    this._onFSChange = this._syncFSBtn.bind(this);
  }

  async load() {
    const {
      video: src,
      width = 0.4,
      height = 0.225,
      autoplay = true,
      loop = false,
      scale = 1,
      offset = [0, 1, 0],
    } = this.config;

    if (!src) {
      console.warn('[VideoReveal] No "video" src in config');
      return;
    }

    this._video = document.createElement('video');
    this._video.crossOrigin = 'anonymous';
    this._video.loop = loop;
    this._video.playsInline = true;
    this._video.setAttribute('playsinline', '');

    this._video.addEventListener('error', () => {
      console.error('[VideoReveal] Video failed to load:', src, this._video.error);
    });

    if (autoplay) {
      this._video.addEventListener('canplay', () => this._playWithAudio(), { once: true });
    }

    // Set src last — triggers load
    this._video.src = src;

    // If already buffered (cached), canplay won't fire again
    if (autoplay && this._video.readyState >= 3) this._playWithAudio();

    const texture = new THREE.VideoTexture(this._video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const faceMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: 0xf0ede8,
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
    });

    const geo = new THREE.BoxGeometry(width, height, PANEL_THICKNESS);
    this.panelMesh = new THREE.Mesh(geo, [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat]);
    this.panelMesh.userData.baseY = 0;

    const container = new THREE.Group();
    container.position.set(offset[0], offset[1], offset[2]);
    container.scale.setScalar(scale);
    container.add(this.panelMesh);
    this.root.add(container);

    this._buildControls();

    document.addEventListener('fullscreenchange', this._onFSChange);
    document.addEventListener('webkitfullscreenchange', this._onFSChange);
  }

  // Try unmuted; fall back to muted if autoplay policy blocks audio
  _playWithAudio() {
    if (!this._video) return;
    this._video.muted = false;
    this._video.play().catch(() => {
      this._video.muted = true;
      this._video.play().catch(e => console.warn('[VideoReveal] Autoplay blocked:', e));
    });
  }

  enter() {
    super.enter();
    if (this._controls) this._controls.style.display = 'flex';
  }

  exit() {
    super.exit();
    if (this._controls) this._controls.style.display = 'none';
  }

  _buildControls() {
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'display:none',
      'position:fixed',
      'bottom:calc(126px + env(safe-area-inset-bottom, 0px))',
      'left:50%',
      'transform:translateX(-50%)',
      'gap:8px',
      'align-items:center',
      'z-index:26',
      'background:rgba(0,0,0,0.38)',
      'backdrop-filter:blur(14px)',
      '-webkit-backdrop-filter:blur(14px)',
      'border:1px solid rgba(255,255,255,0.12)',
      'border-radius:100px',
      'padding:5px',
    ].join(';');

    const mkBtn = (html, onClick) => {
      const b = document.createElement('button');
      b.style.cssText = [
        'width:44px',
        'height:44px',
        'border-radius:50%',
        'border:1px solid rgba(255,255,255,0.22)',
        'background:rgba(255,255,255,0.07)',
        'color:rgba(255,255,255,0.88)',
        'cursor:pointer',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        '-webkit-tap-highlight-color:transparent',
        'outline:none',
        'padding:0',
        'transition:background 120ms ease',
        'flex-shrink:0',
      ].join(';');
      b.innerHTML = html;
      b.addEventListener('pointerdown', () => { b.style.background = 'rgba(255,255,255,0.22)'; });
      b.addEventListener('pointerup',   () => { b.style.background = 'rgba(255,255,255,0.07)'; });
      b.addEventListener('pointerleave',() => { b.style.background = 'rgba(255,255,255,0.07)'; });
      b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
      return b;
    };

    this._playBtn  = mkBtn(PAUSE_ICON,    () => this._togglePlay());
    this._muteBtn  = mkBtn(MUTED_ICON,    () => this._toggleMute());
    this._fsBtn    = mkBtn(FS_ENTER_ICON, () => this._toggleFullscreen());

    wrap.appendChild(this._playBtn);
    wrap.appendChild(this._muteBtn);
    wrap.appendChild(this._fsBtn);
    document.body.appendChild(wrap);
    this._controls = wrap;
  }

  _togglePlay() {
    if (!this._video) return;
    if (this._video.paused) {
      this._playWithAudio();
    } else {
      this._video.pause();
    }
  }

  // Called by interaction.js on panel tap
  togglePlay() {
    this._togglePlay();
  }

  _toggleMute() {
    if (!this._video) return;
    this._video.muted = !this._video.muted;
  }

  _toggleFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      exit.call(document);
    } else if (this._video) {
      if (this._video.requestFullscreen) {
        this._video.requestFullscreen();
      } else if (this._video.webkitEnterFullscreen) {
        this._video.webkitEnterFullscreen();
      }
    }
  }

  _syncFSBtn() {
    if (!this._fsBtn) return;
    const inFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
    this._fsBtn.innerHTML = inFS ? FS_EXIT_ICON : FS_ENTER_ICON;
    // Resume if the browser paused the video on fullscreen exit
    if (!inFS && this._video && this._video.paused) {
      this._video.play().catch(() => {});
    }
  }

  onTick(dt) {
    this._floatTime += dt;
    if (this.panelMesh) {
      this.panelMesh.position.y = Math.sin(this._floatTime * 0.6) * 0.012;
    }
    if (this._video) {
      if (this._playBtn) this._playBtn.innerHTML = this._video.paused ? PLAY_ICON : PAUSE_ICON;
      if (this._muteBtn) this._muteBtn.innerHTML = this._video.muted ? MUTED_ICON : UNMUTED_ICON;
    }
  }

  onDispose() {
    if (this._video) {
      this._video.pause();
      this._video.removeAttribute('src');
      this._video.load();
      this._video = null;
    }
    if (this._controls) {
      this._controls.remove();
      this._controls = null;
    }
    document.removeEventListener('fullscreenchange', this._onFSChange);
    document.removeEventListener('webkitfullscreenchange', this._onFSChange);
    this.panelMesh = null;
    this._playBtn = null;
    this._muteBtn = null;
    this._fsBtn = null;
  }
}
