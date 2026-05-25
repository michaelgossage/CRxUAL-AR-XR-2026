// UI state manager — loading, scanning, active, error states

const elements = {};

let infoPanelCloseCallback = null;
let infoPanelHideTimer = null;
let scanningHideTimer = null;

export function initUI() {
  elements.loadingScreen = document.getElementById('loading-screen');
  elements.loadingBar = document.getElementById('loading-bar');
  elements.loadingStatus = document.getElementById('loading-status');
  elements.startButton = document.getElementById('start-button');
  elements.scanningHint = document.getElementById('scanning-hint');
  elements.hud = document.getElementById('hud');
  elements.hudTitle = document.getElementById('hud-title');
  elements.infoPanel = document.getElementById('info-panel');
  elements.infoPanelTitle = document.getElementById('info-panel-title');
  elements.infoPanelArtist = document.getElementById('info-panel-artist');
  elements.infoPanelDescription = document.getElementById('info-panel-description');
  elements.infoPanelClose = document.getElementById('info-panel-close');
  elements.infoPanelNav = document.getElementById('info-panel-nav');
  elements.infoPanelPrev = document.getElementById('info-panel-prev');
  elements.infoPanelNext = document.getElementById('info-panel-next');
  elements.errorScreen = document.getElementById('error-screen');
  elements.errorTitle = document.getElementById('error-title');
  elements.errorMessage = document.getElementById('error-message');
  elements.errorAction = document.getElementById('error-action');
  elements.desktopScreen = document.getElementById('desktop-screen');
  elements.urlDisplay = document.getElementById('url-display');

  // Wire up info panel close button
  if (elements.infoPanelClose) {
    elements.infoPanelClose.addEventListener('click', () => {
      const cb = infoPanelCloseCallback;
      hideInfoPanel();
      if (cb) cb();
    });
  }
}

export function setLoadingProgress(pct, status) {
  if (elements.loadingBar) {
    elements.loadingBar.style.width = `${pct}%`;
  }
  if (status && elements.loadingStatus) {
    elements.loadingStatus.textContent = status;
  }
}

export function showStartButton(onClick) {
  if (!elements.startButton) return;
  elements.startButton.style.display = 'inline-block';
  elements.loadingStatus.textContent = 'Ready';
  elements.startButton.addEventListener('click', onClick, { once: true });
}

export function hideLoading() {
  if (elements.loadingScreen) {
    elements.loadingScreen.classList.add('hidden');
    setTimeout(() => {
      elements.loadingScreen.style.display = 'none';
    }, 600);
  }
}

export function showScanning() {
  if (elements.scanningHint) {
    if (scanningHideTimer) {
      clearTimeout(scanningHideTimer);
      scanningHideTimer = null;
    }
    elements.scanningHint.style.display = 'flex';
    elements.scanningHint.classList.remove('hidden');
  }
}

export function hideScanning() {
  if (elements.scanningHint) {
    elements.scanningHint.classList.add('hidden');
    if (scanningHideTimer) clearTimeout(scanningHideTimer);
    scanningHideTimer = setTimeout(() => {
      elements.scanningHint.style.display = 'none';
      scanningHideTimer = null;
    }, 400);
  }
}

export function showHUD(title) {
  if (elements.hud) {
    elements.hud.style.display = 'block';
    elements.hud.classList.remove('hidden');
  }
  if (elements.hudTitle) {
    elements.hudTitle.textContent = title;
  }
}

export function hideHUD() {
  if (elements.hud) {
    elements.hud.classList.add('hidden');
  }
}

export function showError(title, message, actionLabel, onAction) {
  if (!elements.errorScreen) return;
  elements.errorScreen.style.display = 'flex';
  elements.errorTitle.textContent = title;
  elements.errorMessage.textContent = message;

  if (actionLabel && onAction) {
    elements.errorAction.style.display = 'inline-block';
    elements.errorAction.textContent = actionLabel;
    elements.errorAction.addEventListener('click', onAction, { once: true });
  }
}

export function showDesktopRedirect() {
  if (elements.desktopScreen) {
    elements.desktopScreen.style.display = 'flex';
  }
  if (elements.urlDisplay) {
    elements.urlDisplay.textContent = window.location.href;
  }
  // Hide loading screen
  if (elements.loadingScreen) {
    elements.loadingScreen.style.display = 'none';
  }
}

export function showInfoPanel({ title, artist, year, description }, onClose, onPrev, onNext) {
  if (!elements.infoPanel) return;
  if (infoPanelHideTimer) {
    clearTimeout(infoPanelHideTimer);
    infoPanelHideTimer = null;
  }
  elements.infoPanelTitle.textContent = title || '';
  const artistText = year ? `${artist}, ${year}` : (artist || '');
  elements.infoPanelArtist.textContent = artistText;
  elements.infoPanelDescription.textContent = description || '';
  infoPanelCloseCallback = onClose || null;

  // Show navigation arrows only when callbacks are provided
  if (elements.infoPanelNav) {
    if (onPrev && onNext) {
      elements.infoPanelPrev.onclick = onPrev;
      elements.infoPanelNext.onclick = onNext;
      elements.infoPanelNav.style.display = 'flex';
    } else {
      elements.infoPanelPrev.onclick = null;
      elements.infoPanelNext.onclick = null;
      elements.infoPanelNav.style.display = 'none';
    }
  }

  elements.infoPanel.style.display = 'flex';
  // Force reflow before removing hidden class for transition
  elements.infoPanel.offsetHeight;
  elements.infoPanel.classList.remove('hidden');
}

export function hideInfoPanel() {
  if (!elements.infoPanel) return;
  elements.infoPanel.classList.add('hidden');
  infoPanelCloseCallback = null;
  if (elements.infoPanelNav) elements.infoPanelNav.style.display = 'none';
  if (infoPanelHideTimer) clearTimeout(infoPanelHideTimer);
  infoPanelHideTimer = setTimeout(() => {
    elements.infoPanel.style.display = 'none';
    infoPanelHideTimer = null;
  }, 350);
}

export function triggerHaptic(duration = 30) {
  if (navigator.vibrate) {
    navigator.vibrate(duration);
  }
}
