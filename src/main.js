// Bootstrap: loading → permissions → AR
import * as THREE from 'three';
import './styles.css';
import { initUI, setLoadingProgress, showStartButton, hideLoading, showError, showDesktopRedirect } from './ui.js';
import { initEngine } from './engine.js';
import { isMobileDevice } from './utils.js';

// 8th Wall self-hosted engine expects THREE as a global
window.THREE = THREE;

async function boot() {
  initUI();

  // Desktop detection
  if (!isMobileDevice()) {
    showDesktopRedirect();
    return;
  }

  setLoadingProgress(5, 'Loading…');

  // Show start button — user tap required for camera permission
  showStartButton(async () => {
    try {
      setLoadingProgress(10, 'Starting AR engine…');
      await initEngine();
      hideLoading();
    } catch (err) {
      console.error('AR init failed:', err);
      handleError(err);
    }
  });

  setLoadingProgress(100, 'Ready');
}

function handleError(err) {
  const msg = err.message || String(err);

  if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
    showError(
      'Camera Access Required',
      'Please enable camera access in your browser settings and reload the page.',
      'Reload',
      () => window.location.reload()
    );
  } else if (msg.includes('NotFoundError')) {
    showError(
      'No Camera Found',
      'This device does not appear to have a camera.',
    );
  } else {
    showError(
      'Something Went Wrong',
      msg,
      'Retry',
      () => window.location.reload()
    );
  }
}

boot();
