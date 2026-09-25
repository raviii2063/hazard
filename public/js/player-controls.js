/**
 * FIRST-PERSON 360° NAVIGATION CONTROLLER & AUDIO SYNTHESIZER
 * Manages Pointer Lock mouse look, Touchpad & Touch Screen Drag-to-Look,
 * WASD & D-Pad first-person walking, collision detection, raycasting hazard detection,
 * and Web Audio API synthesized sound effects.
 */

window.PlayerControls = (function () {
  'use strict';

  let camera, scene, canvasElem;
  let isPointerLocked = false;
  let isDragging = false;
  let previousPointerX = 0, previousPointerY = 0;

  let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
  let yaw = 0, pitch = 0;
  let sensitivity = 0.0025;

  const playerRadius = 0.6;
  const playerSpeed = 5.5;

  // Raycaster for hazard detection
  const raycaster = new THREE.Raycaster();
  const screenCenter = new THREE.Vector2(0, 0);

  let targetedHazard = null;
  let soundMuted = false;
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (soundMuted) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      if (type === 'correct') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      }
      else if (type === 'wrong') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.setValueAtTime(110, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      }
      else if (type === 'tick') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      }
      else if (type === 'victory') {
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.1);
          gain.gain.setValueAtTime(0.25, now + idx * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.1 + 0.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.1);
          osc.stop(now + idx * 0.1 + 0.5);
        });
      }
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  function initControls(threeCamera, threeScene, canvas) {
    camera = threeCamera;
    scene = threeScene;
    canvasElem = canvas;

    camera.position.set(0, 1.7, 0);
    yaw = 0;
    pitch = 0;
    camera.rotation.set(0, 0, 0, 'YXZ');

    setupPointerAndTouchpadEvents();

    document.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveForward = true; break;
        case 'KeyS': case 'ArrowDown': moveBackward = true; break;
        case 'KeyA': case 'ArrowLeft': moveLeft = true; break;
        case 'KeyD': case 'ArrowRight': moveRight = true; break;
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveForward = false; break;
        case 'KeyS': case 'ArrowDown': moveBackward = false; break;
        case 'KeyA': case 'ArrowLeft': moveLeft = false; break;
        case 'KeyD': case 'ArrowRight': moveRight = false; break;
      }
    });

    setupDPadListeners();

    document.getElementById('btn-start-gameplay-touch')?.addEventListener('click', () => {
      const banner = document.getElementById('pointerlock-banner');
      if (banner) banner.style.display = 'none';
      if (!isPointerLocked) {
        try { canvasElem.requestPointerLock(); } catch(e){}
      }
    });
  }

  function setupPointerAndTouchpadEvents() {
    canvasElem.addEventListener('click', () => {
      if (!isPointerLocked && !isDragging) {
        try { canvasElem.requestPointerLock(); } catch(e){}
      }
    });

    document.addEventListener('pointerlockchange', () => {
      isPointerLocked = (document.pointerLockElement === canvasElem);
      const banner = document.getElementById('pointerlock-banner');
      if (banner) {
        banner.style.display = isPointerLocked ? 'none' : 'flex';
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!isPointerLocked) return;

      yaw -= e.movementX * sensitivity;
      pitch -= e.movementY * sensitivity;

      const maxPitch = Math.PI / 2 - 0.05;
      pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));

      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    });

    const onPointerDown = (clientX, clientY) => {
      isDragging = true;
      previousPointerX = clientX;
      previousPointerY = clientY;

      // Hide start overlay on first touch/drag
      const banner = document.getElementById('pointerlock-banner');
      if (banner && banner.style.display !== 'none') {
        banner.style.display = 'none';
      }
    };

    const onPointerMove = (clientX, clientY) => {
      if (!isDragging || isPointerLocked) return;

      const deltaX = clientX - previousPointerX;
      const deltaY = clientY - previousPointerY;

      previousPointerX = clientX;
      previousPointerY = clientY;

      yaw -= deltaX * (sensitivity * 1.5);
      pitch -= deltaY * (sensitivity * 1.5);

      const maxPitch = Math.PI / 2 - 0.05;
      pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));

      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    canvasElem.addEventListener('pointerdown', (e) => onPointerDown(e.clientX, e.clientY));
    window.addEventListener('pointermove', (e) => onPointerMove(e.clientX, e.clientY));
    window.addEventListener('pointerup', onPointerUp);

    canvasElem.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
      }
    });
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    });
    window.addEventListener('touchend', onPointerUp);
  }

  function setupDPadListeners() {
    const btnFwd = document.getElementById('btn-move-fwd');
    const btnBack = document.getElementById('btn-move-back');
    const btnLeft = document.getElementById('btn-move-left');
    const btnRight = document.getElementById('btn-move-right');

    if (btnFwd) {
      btnFwd.addEventListener('pointerdown', () => moveForward = true);
      btnFwd.addEventListener('pointerup', () => moveForward = false);
    }
    if (btnBack) {
      btnBack.addEventListener('pointerdown', () => moveBackward = true);
      btnBack.addEventListener('pointerup', () => moveBackward = false);
    }
    if (btnLeft) {
      btnLeft.addEventListener('pointerdown', () => moveLeft = true);
      btnLeft.addEventListener('pointerup', () => moveLeft = false);
    }
    if (btnRight) {
      btnRight.addEventListener('pointerdown', () => moveRight = true);
      btnRight.addEventListener('pointerup', () => moveRight = false);
    }
  }

  function update(delta) {
    if (!camera) return;

    const moveVector = new THREE.Vector3();

    if (moveForward) moveVector.z -= 1;
    if (moveBackward) moveVector.z += 1;
    if (moveLeft) moveVector.x -= 1;
    if (moveRight) moveVector.x += 1;

    moveVector.normalize();

    if (moveVector.lengthSq() > 0) {
      const euler = new THREE.Euler(0, yaw, 0, 'YXZ');
      moveVector.applyEuler(euler);

      const nextPosX = camera.position.x + moveVector.x * playerSpeed * delta;
      const nextPosZ = camera.position.z + moveVector.z * playerSpeed * delta;

      if (nextPosX >= -14.0 + playerRadius && nextPosX <= 14.0 - playerRadius) {
        camera.position.x = nextPosX;
      }
      if (nextPosZ >= -53.0 + playerRadius && nextPosZ <= 4.0 - playerRadius) {
        camera.position.z = nextPosZ;
      }
    }

    camera.position.y = 1.7;

    performRaycastCheck();
  }

  // RAYCAST HAZARD TARGETING (INCREASED INTERACTION DISTANCE TO 12m FOR EASY SPOTTING)
  function performRaycastCheck() {
    if (!camera || !scene) return;

    raycaster.setFromCamera(screenCenter, camera);
    const activeMeshes = window.ScenarioBuilder ? window.ScenarioBuilder.getActiveHazardMeshes() : [];

    const targetableObjects = activeMeshes
      .filter(item => !item.solved)
      .map(item => item.mesh);

    const intersects = raycaster.intersectObjects(targetableObjects, true);

    const promptElem = document.getElementById('hazard-prompt');
    const nameElem = document.getElementById('prompt-hazard-name');

    if (intersects.length > 0 && intersects[0].distance <= 12.0) {
      let obj = intersects[0].object;
      while (obj && !obj.userData.hazardId && obj.parent) {
        obj = obj.parent;
      }

      if (obj && obj.userData && obj.userData.hazardId) {
        targetedHazard = obj.userData;
        if (promptElem && nameElem) {
          nameElem.textContent = targetedHazard.hazardName.toUpperCase();
          promptElem.style.display = 'flex';
        }
        return;
      }
    }

    targetedHazard = null;
    if (promptElem) {
      promptElem.style.display = 'none';
    }
  }

  function setSensitivity(val) {
    sensitivity = 0.0005 * val;
  }

  function toggleSound() {
    soundMuted = !soundMuted;
    return soundMuted;
  }

  function releasePointerLock() {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  return {
    initControls,
    update,
    getTargetedHazard: () => targetedHazard,
    setSensitivity,
    toggleSound,
    isMuted: () => soundMuted,
    playSound,
    releasePointerLock
  };
})();
