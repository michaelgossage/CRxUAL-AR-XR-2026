// UI state manager — loading, scanning, active, error states

const elements = {};

let drawerOpen = false;
let artworkCloseCallback = null;
let drawerHideTimer = null;
let headerHideTimer = null;
let scanningHideTimer = null;

export function initUI() {
  elements.loadingScreen = document.getElementById('loading-screen');
  elements.loadingBar = document.getElementById('loading-bar');
  elements.loadingStatus = document.getElementById('loading-status');
  elements.loadingBarTrack = elements.loadingBar?.closest('.loading-bar-track');
  elements.ctaPair = document.getElementById('cta-pair');
  elements.startButton = document.getElementById('start-button');
  elements.scanningHint = document.getElementById('scanning-hint');

  elements.artworkHeader = document.getElementById('artwork-header');
  elements.artworkTitleLink = document.getElementById('artwork-title-link');
  elements.artworkArtist = document.getElementById('artwork-artist');
  elements.artworkClose = document.getElementById('artwork-close');

  elements.descriptionDrawer = document.getElementById('description-drawer');
  elements.drawerHandle = document.getElementById('drawer-handle');
  elements.drawerNav = document.getElementById('drawer-nav');
  elements.drawerPrev = document.getElementById('drawer-prev');
  elements.drawerNext = document.getElementById('drawer-next');
  elements.artworkDescription = document.getElementById('artwork-description');

  elements.exhibitionBar = document.getElementById('exhibition-bar');

  elements.errorScreen = document.getElementById('error-screen');
  elements.errorTitle = document.getElementById('error-title');
  elements.errorMessage = document.getElementById('error-message');
  elements.errorAction = document.getElementById('error-action');
  elements.desktopScreen = document.getElementById('desktop-screen');
  elements.urlDisplay = document.getElementById('url-display');

  if (elements.artworkClose) {
    elements.artworkClose.addEventListener('click', () => {
      const cb = artworkCloseCallback;
      hideInfoPanel();
      if (cb) cb();
    });
  }

  if (elements.drawerHandle) {
    elements.drawerHandle.addEventListener('click', _toggleDrawer);
  }
}

function _toggleDrawer() {
  if (!elements.descriptionDrawer) return;
  drawerOpen = !drawerOpen;
  elements.descriptionDrawer.classList.toggle('expanded', drawerOpen);
}

export function setLoadingProgress(pct, status) {
  if (elements.loadingBar) elements.loadingBar.style.width = `${pct}%`;
  if (status && elements.loadingStatus) elements.loadingStatus.textContent = status;
}

export function showStartButton(onClick) {
  if (!elements.ctaPair) return;
  // Swap loading bar + status for the two CTA buttons
  if (elements.loadingBarTrack) elements.loadingBarTrack.style.display = 'none';
  if (elements.loadingStatus) elements.loadingStatus.style.display = 'none';
  elements.ctaPair.style.display = 'flex';
  elements.startButton.addEventListener('click', onClick, { once: true });
}

export function hideLoading() {
  if (elements.loadingScreen) {
    elements.loadingScreen.classList.add('hidden');
    setTimeout(() => {
      elements.loadingScreen.style.display = 'none';
    }, 600);
  }
  _showExhibitionBar();
}

function _showExhibitionBar() {
  if (!elements.exhibitionBar) return;
  elements.exhibitionBar.style.display = 'flex';
  elements.exhibitionBar.offsetHeight;
  elements.exhibitionBar.classList.remove('hidden');
}

export function showScanning() {
  if (elements.scanningHint) {
    if (scanningHideTimer) { clearTimeout(scanningHideTimer); scanningHideTimer = null; }
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

// showHUD / hideHUD kept for call-site compatibility in targets.js
export function showHUD() {}

export function hideHUD() {
  _hideArtworkHeader();
  _hideDrawer();
}

function _showArtworkHeader() {
  if (!elements.artworkHeader) return;
  if (headerHideTimer) { clearTimeout(headerHideTimer); headerHideTimer = null; }
  elements.artworkHeader.style.display = 'flex';
  elements.artworkHeader.offsetHeight;
  elements.artworkHeader.classList.remove('hidden');
}

function _hideArtworkHeader() {
  if (!elements.artworkHeader) return;
  elements.artworkHeader.classList.add('hidden');
  if (headerHideTimer) clearTimeout(headerHideTimer);
  headerHideTimer = setTimeout(() => {
    if (elements.artworkHeader.classList.contains('hidden')) {
      elements.artworkHeader.style.display = 'none';
    }
    headerHideTimer = null;
  }, 400);
}

function _showDrawer() {
  if (!elements.descriptionDrawer) return;
  if (drawerHideTimer) { clearTimeout(drawerHideTimer); drawerHideTimer = null; }
  drawerOpen = false;
  elements.descriptionDrawer.classList.remove('expanded');
  elements.descriptionDrawer.style.display = 'flex';
  elements.descriptionDrawer.offsetHeight;
  elements.descriptionDrawer.classList.remove('hidden');
}

function _hideDrawer() {
  if (!elements.descriptionDrawer) return;
  drawerOpen = false;
  elements.descriptionDrawer.classList.remove('expanded');
  elements.descriptionDrawer.classList.add('hidden');
  if (drawerHideTimer) clearTimeout(drawerHideTimer);
  drawerHideTimer = setTimeout(() => {
    elements.descriptionDrawer.style.display = 'none';
    drawerHideTimer = null;
  }, 400);
}

export function showInfoPanel({ title, artist, year, description, url }, onClose, onPrev, onNext) {
  if (elements.artworkTitleLink) {
    elements.artworkTitleLink.textContent = title || '';
    if (url) {
      elements.artworkTitleLink.href = url;
      elements.artworkTitleLink.setAttribute('target', '_blank');
      elements.artworkTitleLink.setAttribute('rel', 'noopener');
      elements.artworkTitleLink.classList.add('has-link');
    } else {
      elements.artworkTitleLink.removeAttribute('href');
      elements.artworkTitleLink.removeAttribute('target');
      elements.artworkTitleLink.removeAttribute('rel');
      elements.artworkTitleLink.classList.remove('has-link');
    }
  }

  if (elements.artworkArtist) {
    elements.artworkArtist.textContent = year ? `${artist}, ${year}` : (artist || '');
  }

  if (elements.artworkDescription) {
    elements.artworkDescription.textContent = description || '';
  }

  artworkCloseCallback = onClose || null;

  if (elements.drawerNav) {
    if (onPrev && onNext) {
      elements.drawerPrev.onclick = onPrev;
      elements.drawerNext.onclick = onNext;
      elements.drawerNav.style.display = 'flex';
    } else {
      elements.drawerPrev.onclick = null;
      elements.drawerNext.onclick = null;
      elements.drawerNav.style.display = 'none';
    }
  }

  _showArtworkHeader();
  _showDrawer();
}

export function hideInfoPanel() {
  artworkCloseCallback = null;
  _hideArtworkHeader();
  _hideDrawer();
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
  if (elements.desktopScreen) elements.desktopScreen.style.display = 'flex';
  if (elements.urlDisplay) elements.urlDisplay.textContent = window.location.href;
  if (elements.loadingScreen) elements.loadingScreen.style.display = 'none';
}

export function triggerHaptic(duration = 30) {
  if (navigator.vibrate) navigator.vibrate(duration);
}
