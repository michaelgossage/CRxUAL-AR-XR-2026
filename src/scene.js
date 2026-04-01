// Scene management — creates the custom pipeline module for 8th Wall
import * as THREE from 'three';
import { initTargets, tickReveals, onImageFound, onImageUpdated, onImageLost } from './targets.js';

let scene, camera, renderer;
let clock;

export function getSceneRefs() {
  return { scene, camera, renderer };
}

// Custom pipeline module for 8th Wall
export function createSceneModule() {
  clock = new THREE.Clock();

  return {
    name: 'chancery-scene',

    onStart: ({ canvas }) => {
      // Get Three.js refs from 8th Wall
      const xrScene = XR8.Threejs.xrScene();
      scene = xrScene.scene;
      camera = xrScene.camera;
      renderer = xrScene.renderer;

      // Cap pixel ratio for performance
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);

      // Lighting
      const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
      hemiLight.position.set(0, 1, 0);
      scene.add(hemiLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(0.5, 1, 0.3);
      scene.add(dirLight);

      // Ambient fill
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
      scene.add(ambientLight);

      // Init targets immediately so image events have scene/camera refs
      initTargets({ scene, camera });
      console.log('[AR] Scene initialized, targets ready');

      clock.start();
    },

    onUpdate: () => {
      const dt = clock.getDelta();
      tickReveals(dt);
    },

    onRender: () => {
      renderer.clearDepth();
      renderer.render(scene, camera);
    },

    // Image target listeners
    listeners: [
      {
        event: 'reality.imagefound',
        process: ({ detail }) => {
          console.log('[AR] IMAGE FOUND:', detail.name, 'pos:', detail.position, 'rot:', detail.rotation);
          onImageFound(detail);
        },
      },
      {
        event: 'reality.imageupdated',
        process: ({ detail }) => {
          onImageUpdated(detail);
        },
      },
      {
        event: 'reality.imagelost',
        process: ({ detail }) => {
          console.log('[AR] IMAGE LOST:', detail.name);
          onImageLost(detail);
        },
      },
    ],
  };
}
