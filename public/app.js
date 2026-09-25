(function() {
  'use strict';

  /* =========================================================================
     REST API CLIENT & STATE MANAGEMENT
     ========================================================================= */
  const API_BASE = '/api';
  let authToken = localStorage.getItem('hz_token') || null;
  let currentUser = null;

  async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, opts);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server error occurred');
      }
      return data;
    } catch (err) {
      throw err;
    }
  }

  function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;

    let iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    if (type === 'error') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else if (type === 'admin') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    }

    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">${iconSvg}</div>
        <span>${message}</span>
      </div>
      <button class="toast-close">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    const dismiss = () => {
      if (toast.classList.contains('toast-leaving')) return;
      toast.classList.add('toast-leaving');
      setTimeout(() => toast.remove(), 300);
    };

    closeBtn.addEventListener('click', dismiss);
    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }
  }

  function updateNavUI() {
    const userBadge = document.getElementById('user-badge');
    const nameElem = document.getElementById('user-display-name');
    const roleElem = userBadge.querySelector('.user-role');
    const btnAuth = document.getElementById('btn-nav-auth');
    const btnAdmin = document.getElementById('btn-nav-admin');
    const btnLogout = document.getElementById('btn-nav-logout');
    const btnHistory = document.getElementById('btn-my-history');

    if (currentUser) {
      roleElem.textContent = currentUser.role.toUpperCase();
      roleElem.className = 'user-role ' + (currentUser.role === 'admin' ? 'role-admin' : '');
      nameElem.textContent = currentUser.username;
      
      btnAuth.style.display = 'none';
      btnLogout.style.display = 'inline-flex';
      btnHistory.style.display = 'inline-flex';

      if (currentUser.role === 'admin') {
        btnAdmin.style.display = 'inline-flex';
      } else {
        btnAdmin.style.display = 'none';
      }
    } else {
      roleElem.textContent = 'GUEST';
      roleElem.className = 'user-role role-guest';
      nameElem.textContent = 'Not Logged In';

      btnAuth.style.display = 'inline-flex';
      btnAdmin.style.display = 'none';
      btnLogout.style.display = 'none';
      btnHistory.style.display = 'none';
    }
  }

  async function initAuth() {
    if (authToken) {
      try {
        const data = await apiCall('/auth/me');
        currentUser = data.user;
      } catch (e) {
        console.warn('Saved token expired or invalid:', e.message);
        authToken = null;
        localStorage.removeItem('hz_token');
      }
    }
    updateNavUI();
  }

  /* =========================================================================
     THREE.JS 3D ENGINE, 360 DEGREE MOUSE CONTROLLER & KEYBOARD WALKING
     ========================================================================= */
  let threeRenderer = null;
  let threeScene = null;
  let threeCamera = null;
  let activeSceneObjects = [];
  let isThreeInitialized = false;

  // 360 Degree Camera State
  let cameraYaw = 0;
  let cameraPitch = 0;
  let targetYaw = 0;
  let targetPitch = 0;
  let baseScenarioYaw = 0;

  let isPointerDown = false;
  let isDraggingCamera = false;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;

  // Keyboard & D-Pad Movement State
  const keysPressed = {};
  const dpadActive = { fwd: false, back: false, left: false, right: false };
  let walkStepTimer = 0;

  function initThreeEngine() {
    const canvas = document.getElementById('three-canvas');
    if (!canvas || !window.THREE) return;

    const container = document.getElementById('viewport-container');
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 450;

    threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(0x0f172a); // Industrial Dark Slate
    threeScene.fog = new THREE.FogExp2(0x0f172a, 0.035);

    threeCamera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    threeCamera.position.set(0, 1.65, 3.5);

    threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    threeRenderer.setSize(width, height);
    threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    threeRenderer.shadowMap.enabled = true;
    threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Window Resize listener
    window.addEventListener('resize', onWindowResize);

    // Setup 360 Mouse & Touch Panning Controls
    setup360CameraControls(container);

    // Setup First-Person Keyboard & D-Pad Walking Controls
    setupKeyboardWalkingControls();

    isThreeInitialized = true;
  }

  function setup360CameraControls(container) {
    container.addEventListener('pointerdown', (e) => {
      // Don't drag camera if clicking on on-screen D-Pad buttons
      if (e.target && e.target.classList && e.target.classList.contains('dpad-btn')) return;

      isPointerDown = true;
      isDraggingCamera = false;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!threeCamera || !isClipActive) return;

      if (isPointerDown) {
        const dx = e.clientX - lastPointerX;
        const dy = e.clientY - lastPointerY;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;

        const distMoved = Math.hypot(e.clientX - pointerStartX, e.clientY - pointerStartY);
        if (distMoved > 6) {
          isDraggingCamera = true;
        }

        const sensitivity = 0.005;
        targetYaw -= dx * sensitivity;
        targetPitch -= dy * sensitivity;
      }
    });

    window.addEventListener('pointerup', () => {
      isPointerDown = false;
    });

    // Touch Support
    container.addEventListener('touchstart', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('dpad-btn')) return;

      if (e.touches.length === 1) {
        isPointerDown = true;
        isDraggingCamera = false;
        pointerStartX = e.touches[0].clientX;
        pointerStartY = e.touches[0].clientY;
        lastPointerX = e.touches[0].clientX;
        lastPointerY = e.touches[0].clientY;
      }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (isPointerDown && e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastPointerX;
        const dy = e.touches[0].clientY - lastPointerY;
        lastPointerX = e.touches[0].clientX;
        lastPointerY = e.touches[0].clientY;

        const distMoved = Math.hypot(e.touches[0].clientX - pointerStartX, e.touches[0].clientY - pointerStartY);
        if (distMoved > 6) {
          isDraggingCamera = true;
        }

        const sensitivity = 0.006;
        targetYaw -= dx * sensitivity;
        targetPitch -= dy * sensitivity;
      }
    }, { passive: true });

    container.addEventListener('touchend', () => {
      isPointerDown = false;
    });
  }

  function setupKeyboardWalkingControls() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept text input fields
      if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

      const code = e.code;
      const key = e.key ? e.key.toLowerCase() : '';

      const isMoveKey = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(code) ||
                        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key);

      if (isMoveKey) {
        keysPressed[code] = true;
        keysPressed[key] = true;

        const gameScreen = document.getElementById('screen-game');
        if (gameScreen && gameScreen.classList.contains('active')) {
          e.preventDefault();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      const key = e.key ? e.key.toLowerCase() : '';

      const isMoveKey = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(code) ||
                        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key);

      if (isMoveKey) {
        keysPressed[code] = false;
        keysPressed[key] = false;
      }
    });

    // D-Pad Touch/Pointer Bindings
    setupDpadBtn('btn-move-fwd', 'fwd');
    setupDpadBtn('btn-move-back', 'back');
    setupDpadBtn('btn-move-left', 'left');
    setupDpadBtn('btn-move-right', 'right');
  }

  function setupDpadBtn(btnId, dirKey) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const startAction = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dpadActive[dirKey] = true;
      btn.classList.add('active');
    };

    const stopAction = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dpadActive[dirKey] = false;
      btn.classList.remove('active');
    };

    btn.addEventListener('pointerdown', startAction);
    btn.addEventListener('pointerup', stopAction);
    btn.addEventListener('pointercancel', stopAction);
    btn.addEventListener('pointerleave', stopAction);
    btn.addEventListener('touchstart', startAction, { passive: false });
    btn.addEventListener('touchend', stopAction, { passive: false });
  }

  function updateKeyboardMovement() {
    if (!threeCamera) return;
    const gameScreen = document.getElementById('screen-game');
    if (!gameScreen || !gameScreen.classList.contains('active')) return;

    const isShift = keysPressed['ShiftLeft'] || keysPressed['ShiftRight'] || keysPressed['shift'];
    const moveSpeed = isShift ? 0.18 : 0.10; // Walking / Sprinting speed

    let moveForward = 0;
    let moveRight = 0;

    if (keysPressed['KeyW'] || keysPressed['w'] || keysPressed['ArrowUp'] || keysPressed['arrowup'] || dpadActive.fwd) moveForward += 1;
    if (keysPressed['KeyS'] || keysPressed['s'] || keysPressed['ArrowDown'] || keysPressed['arrowdown'] || dpadActive.back) moveForward -= 1;
    if (keysPressed['KeyD'] || keysPressed['d'] || keysPressed['ArrowRight'] || keysPressed['arrowright'] || dpadActive.right) moveRight += 1;
    if (keysPressed['KeyA'] || keysPressed['a'] || keysPressed['ArrowLeft'] || keysPressed['arrowleft'] || dpadActive.left) moveRight -= 1;

    if (moveForward !== 0 || moveRight !== 0) {
      // Normalize directional movement vector
      const len = Math.hypot(moveForward, moveRight);
      const normFwd = moveForward / len;
      const normRight = moveRight / len;

      const sinYaw = Math.sin(cameraYaw);
      const cosYaw = Math.cos(cameraYaw);

      // Forward vector relative to camera yaw: (sinYaw, 0, -cosYaw)
      // Right vector relative to camera yaw: (cosYaw, 0, sinYaw)
      const deltaX = (sinYaw * normFwd + cosYaw * normRight) * moveSpeed;
      const deltaZ = (-cosYaw * normFwd + sinYaw * normRight) * moveSpeed;

      threeCamera.position.x += deltaX;
      threeCamera.position.z += deltaZ;

      // Expanded warehouse floor boundaries
      threeCamera.position.x = Math.max(-14.0, Math.min(14.0, threeCamera.position.x));
      threeCamera.position.z = Math.max(-28.0, Math.min(12.0, threeCamera.position.z));

      // Head bobbing simulation while walking
      walkStepTimer += 0.22;
      threeCamera.position.y = 1.65 + Math.sin(walkStepTimer) * 0.04;
    } else {
      threeCamera.position.y += (1.65 - threeCamera.position.y) * 0.1;
    }
  }

  function update360Camera() {
    if (!threeCamera) return;

    cameraYaw += (targetYaw - cameraYaw) * 0.12;
    cameraPitch += (targetPitch - cameraPitch) * 0.12;

    const maxPitch = Math.PI / 2.5;
    cameraPitch = Math.max(-maxPitch, Math.min(maxPitch, cameraPitch));

    threeCamera.rotation.set(cameraPitch, cameraYaw, 0, 'YXZ');
  }

  function onWindowResize() {
    if (!threeRenderer || !threeCamera) return;
    const container = document.getElementById('viewport-container');
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 450;

    threeCamera.aspect = width / height;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(width, height);
  }

  function clearThreeScene() {
    if (!threeScene) return;
    activeSceneObjects.forEach(obj => {
      threeScene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    activeSceneObjects = [];
  }

  // Texture Loader for 360 Photorealistic Warehouse Skybox
  let textureLoader = null;
  let warehouseTexture = null;

  function getWarehouseTexture() {
    if (!window.THREE) return null;
    if (!textureLoader) textureLoader = new THREE.TextureLoader();
    if (!warehouseTexture) {
      warehouseTexture = textureLoader.load('warehouse_360.jpg');
    }
    return warehouseTexture;
  }

  // -------------------------------------------------------------------------
  // 3D Warehouse Environment Builder (360° Skybox + Floor + Racks & Lighting)
  // -------------------------------------------------------------------------
  function buildBaseWarehouseEnvironment() {
    // 1. 360° Photorealistic Warehouse Skybox Dome
    const tex = getWarehouseTexture();
    if (tex) {
      const skyGeo = new THREE.SphereGeometry(60, 60, 40);
      skyGeo.scale(-1, 1, 1); // Invert sphere geometry to project panorama inside
      const skyMat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.DoubleSide
      });
      const skySphere = new THREE.Mesh(skyGeo, skyMat);
      skySphere.position.set(0, 0, 0);
      skySphere.rotation.y = Math.PI; // Orient primary warehouse aisle toward operator
      threeScene.add(skySphere);
      activeSceneObjects.push(skySphere);
    }

    // 2. Walkable Concrete Floor & Walkway Lines
    const floorGeo = new THREE.PlaneGeometry(40, 50);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.6,
      metalness: 0.2,
      transparent: true,
      opacity: 0.85
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -10);
    floor.receiveShadow = true;
    threeScene.add(floor);
    activeSceneObjects.push(floor);

    // Safety Walkway Yellow Stripes on Floor
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const lineLeftGeo = new THREE.PlaneGeometry(0.15, 45);
    const lineLeft = new THREE.Mesh(lineLeftGeo, lineMat);
    lineLeft.rotation.x = -Math.PI / 2;
    lineLeft.position.set(-2.2, 0.01, -10);
    threeScene.add(lineLeft);
    activeSceneObjects.push(lineLeft);

    const lineRight = lineLeft.clone();
    lineRight.position.set(2.2, 0.01, -10);
    threeScene.add(lineRight);
    activeSceneObjects.push(lineRight);

    // 3. Scene Illumination & Dynamic Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    threeScene.add(ambientLight);
    activeSceneObjects.push(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(5, 14, 2);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    threeScene.add(dirLight);
    activeSceneObjects.push(dirLight);

    // Overhead Fluorescent Fixtures
    [-2, 2].forEach(x => {
      [-5, -15, 2].forEach(z => {
        const fixtureGeo = new THREE.BoxGeometry(1.2, 0.1, 3);
        const fixtureMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
        const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
        fixture.position.set(x, 6, z);
        threeScene.add(fixture);
        activeSceneObjects.push(fixture);

        const pointLight = new THREE.PointLight(0xfffaed, 0.5, 12);
        pointLight.position.set(x, 5.8, z);
        threeScene.add(pointLight);
        activeSceneObjects.push(pointLight);
      });
    });
  }

  // Helper: Create 3D High-Bay Industrial Rack Frame with Pallets & Boxes
  function create3DRack(xPos, zPos) {
    const rackGroup = new THREE.Group();
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.8 });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.7 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8 });
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.9 });
    const palletMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });

    // Vertical Steel Posts
    const postGeo = new THREE.BoxGeometry(0.12, 6, 0.12);
    [-0.8, 0.8].forEach(dx => {
      [-6, 0, 6].forEach(dz => {
        const post = new THREE.Mesh(postGeo, rackMat);
        post.position.set(dx, 3, dz);
        post.castShadow = true;
        rackGroup.add(post);
      });
    });

    // Horizontal Orange Support Beams & Shelves
    [1.2, 2.8, 4.4].forEach(y => {
      const beamGeo = new THREE.BoxGeometry(1.7, 0.1, 12.2);
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(0, y, 0);
      beam.castShadow = true;
      rackGroup.add(beam);

      // Add Pallets & Cargo Crates onto Shelves
      for (let dz = -5; dz <= 5; dz += 2.2) {
        if (Math.random() > 0.2) {
          const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.3), palletMat);
          pallet.position.set(0, y + 0.1, dz);
          pallet.castShadow = true;
          rackGroup.add(pallet);

          const boxHeight = 0.6 + Math.random() * 0.4;
          const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, boxHeight, 1.1), Math.random() > 0.5 ? crateMat : boxMat);
          box.position.set((Math.random() - 0.5) * 0.1, y + 0.12 + boxHeight / 2, dz);
          box.castShadow = true;
          rackGroup.add(box);
        }
      }
    });

    rackGroup.position.set(xPos, 0, zPos);
    return rackGroup;
  }

  function create3DForklift() {
    const fkGroup = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(1.6, 1.0, 2.4);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.3, metalness: 0.5 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0.7, 0);
    body.castShadow = true;
    fkGroup.add(body);

    const grillMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const grill = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.1), grillMat);
    grill.position.set(0, 0.7, 1.21);
    fkGroup.add(grill);

    const cageMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.4, metalness: 0.8 });
    const barGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4);
    [[-0.7, 0.7], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7]].forEach(([cx, cz]) => {
      const bar = new THREE.Mesh(barGeo, cageMat);
      bar.position.set(cx, 1.9, cz);
      fkGroup.add(bar);
    });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.5), cageMat);
    roof.position.set(0, 2.6, 0);
    fkGroup.add(roof);

    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.25), beaconMat);
    beacon.position.set(0, 2.75, -0.2);
    fkGroup.add(beacon);

    const beaconLight = new THREE.PointLight(0xf59e0b, 0, 6);
    beaconLight.position.set(0, 2.8, -0.2);
    fkGroup.add(beaconLight);

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    [[-0.85, 0.35, 0.7], [0.85, 0.35, 0.7], [-0.85, 0.35, -0.7], [0.85, 0.35, -0.7]].forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, wy, wz);
      wheel.castShadow = true;
      fkGroup.add(wheel);
    });

    const mastMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.3 });
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.1), mastMat);
    mast.position.set(0, 1.2, -1.25);
    fkGroup.add(mast);

    const forkMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.95 });
    [-0.3, 0.3].forEach(fx => {
      const fork = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 1.2), forkMat);
      fork.position.set(fx, 0.12, -1.8);
      fork.castShadow = true;
      fkGroup.add(fork);
    });

    return { group: fkGroup, beacon, beaconLight };
  }

  function create3DWorker() {
    const wrkGroup = new THREE.Group();

    const headMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), headMat);
    head.position.set(0, 1.6, 0);
    wrkGroup.add(head);

    const hardhatMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.12), hardhatMat);
    hat.position.set(0, 1.72, 0);
    wrkGroup.add(hat);

    const vestMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.25), vestMat);
    torso.position.set(0, 1.15, 0);
    torso.castShadow = true;
    wrkGroup.add(torso);

    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.08, 0.27), stripeMat);
    stripe.position.set(0, 1.15, 0);
    wrkGroup.add(stripe);

    const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    [-0.12, 0.12].forEach(lx => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7), legMat);
      leg.position.set(lx, 0.45, 0);
      leg.castShadow = true;
      wrkGroup.add(leg);
    });

    const boxMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), boxMat);
    box.position.set(0, 1.1, -0.32);
    box.castShadow = true;
    wrkGroup.add(box);

    return wrkGroup;
  }

  /* =========================================================================
     4 REAL-TIME 3D HAZARD SCENARIOS
     ========================================================================= */
  const SCENARIOS_3D = [
    {
      id: 1,
      title: "High-Bay Aisle",
      hazardName: "Reversing Forklift (Aisle Intersection)",
      durationMs: 12000,
      windowStartMs: 4200,
      build3D() {
        clearThreeScene();
        buildBaseWarehouseEnvironment();

        const rackLeft = create3DRack(-3.2, -10);
        const rackRight = create3DRack(3.2, -10);
        threeScene.add(rackLeft, rackRight);
        activeSceneObjects.push(rackLeft, rackRight);

        const { group: fkGroup, beacon, beaconLight } = create3DForklift();
        fkGroup.position.set(0.6, 0, -18);
        threeScene.add(fkGroup);
        activeSceneObjects.push(fkGroup);

        threeCamera.position.set(0, 1.65, 3.5);
        baseScenarioYaw = 0;
        targetYaw = 0;
        targetPitch = 0;

        return {
          animate(elapsedMs) {
            if (elapsedMs >= 4200) {
              const strobeOn = Math.floor(elapsedMs / 180) % 2 === 0;
              beacon.material.color.setHex(strobeOn ? 0xef4444 : 0xf59e0b);
              beaconLight.intensity = strobeOn ? 3.0 : 0.2;
              beaconLight.color.setHex(strobeOn ? 0xef4444 : 0xf59e0b);

              const tRev = Math.min(1, (elapsedMs - 4200) / 3200);
              fkGroup.position.z = -18 + tRev * 14.5;
              fkGroup.position.x = 0.6 - tRev * 0.6;
            }
          }
        };
      }
    },

    {
      id: 2,
      title: "Loading Bay",
      hazardName: "Falling Cargo Crates (Unstable Stack)",
      durationMs: 14000,
      windowStartMs: 5000,
      build3D() {
        clearThreeScene();
        buildBaseWarehouseEnvironment();

        const stackGroup = new THREE.Group();
        const crateMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 });
        const cautionMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.6 });

        const baseBox = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), crateMat);
        baseBox.position.set(1.8, 0.6, -4.5);
        stackGroup.add(baseBox);

        const midBox = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), crateMat);
        midBox.position.set(1.8, 1.7, -4.5);
        stackGroup.add(midBox);

        const topCrate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), cautionMat);
        topCrate.position.set(1.8, 2.65, -4.5);
        stackGroup.add(topCrate);

        threeScene.add(stackGroup);
        activeSceneObjects.push(stackGroup);

        threeCamera.position.set(0, 1.65, 2.5);
        baseScenarioYaw = -0.25;
        targetYaw = -0.25;
        targetPitch = 0;

        return {
          animate(elapsedMs) {
            if (elapsedMs < 5000) {
              topCrate.position.set(1.8, 2.65, -4.5);
              topCrate.rotation.set(0, 0, 0);
            } else {
              const tFall = Math.min(1, (elapsedMs - 5000) / 2200);
              const rotZ = tFall * Math.PI * 0.65;
              const posX = 1.8 - tFall * 1.8;
              const posY = Math.max(0.45, 2.65 - tFall * tFall * 2.2);

              topCrate.position.set(posX, posY, -4.5 + tFall * 0.8);
              topCrate.rotation.z = rotZ;
              topCrate.rotation.x = tFall * 0.5;
            }
          }
        };
      }
    },

    {
      id: 3,
      title: "Blind Rack Corner",
      hazardName: "Stepping Worker (Blind Corner)",
      durationMs: 13000,
      windowStartMs: 3800,
      build3D() {
        clearThreeScene();
        buildBaseWarehouseEnvironment();

        const rackLeft = create3DRack(-2.0, -5);
        threeScene.add(rackLeft);
        activeSceneObjects.push(rackLeft);

        const workerGroup = create3DWorker();
        workerGroup.position.set(-2.8, 0, -4.5);
        workerGroup.rotation.y = Math.PI / 2;
        threeScene.add(workerGroup);
        activeSceneObjects.push(workerGroup);

        threeCamera.position.set(0.5, 1.65, 2.0);
        baseScenarioYaw = 0.35;
        targetYaw = 0.35;
        targetPitch = 0;

        return {
          animate(elapsedMs) {
            if (elapsedMs >= 3800) {
              const tStep = Math.min(1, (elapsedMs - 3800) / 2400);
              const wrkX = -2.8 + tStep * 2.6;
              const wrkZ = -4.5 + tStep * 0.8;
              workerGroup.position.set(wrkX, 0, wrkZ);
              workerGroup.position.y = Math.abs(Math.sin(tStep * 15) * 0.08);
            }
          }
        };
      }
    },

    {
      id: 4,
      title: "Chemical Storage Bay",
      hazardName: "Chemical Drum Leak & Toxic Spill",
      durationMs: 13000,
      windowStartMs: 4500,
      build3D() {
        clearThreeScene();
        buildBaseWarehouseEnvironment();

        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 24), new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.3 }));
        drum.position.set(-1.6, 0.6, -4.0);
        threeScene.add(drum);
        activeSceneObjects.push(drum);

        const puddleMat = new THREE.MeshStandardMaterial({
          color: 0x22c55e,
          roughness: 0.1,
          metalness: 0.8,
          emissive: 0x15803d,
          emissiveIntensity: 0.4
        });
        const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.01, 32), puddleMat);
        puddle.rotation.x = -Math.PI / 2;
        puddle.position.set(-1.2, 0.015, -3.6);
        threeScene.add(puddle);
        activeSceneObjects.push(puddle);

        threeCamera.position.set(0, 1.65, 2.0);
        baseScenarioYaw = 0.2;
        targetYaw = 0.2;
        targetPitch = 0;

        return {
          animate(elapsedMs) {
            if (elapsedMs >= 4500) {
              const tSpill = Math.min(1, (elapsedMs - 4500) / 2800);
              const radius = 0.01 + tSpill * 1.6;
              puddle.scale.set(radius * 100, radius * 100, 1);
              puddleMat.emissiveIntensity = 0.4 + Math.sin(elapsedMs / 200) * 0.2;
            }
          }
        };
      }
    }
  ];

  /* =========================================================================
     GAME STATE ENGINE & TIMERS
     ========================================================================= */
  let currentClipIndex = 0;
  let totalScore = 0;
  let clipResults = [];
  let isClipActive = false;
  let hasClicked = false;
  let clipStartTime = 0;
  let sceneInstance = null;
  let animFrameId = null;
  let activeTimers = [];

  const screens = {
    intro: document.getElementById('screen-intro'),
    rules: document.getElementById('screen-rules'),
    game: document.getElementById('screen-game'),
    results: document.getElementById('screen-results'),
    admin: document.getElementById('screen-admin')
  };

  const hud = {
    clipNum: document.getElementById('hud-clip-num'),
    scoreVal: document.getElementById('hud-score-val'),
    progressFill: document.getElementById('hud-progress-fill'),
    feedbackText: document.getElementById('feedback-text')
  };

  const interactiveOverlay = document.getElementById('interactive-overlay');

  function clearAllTimers() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    activeTimers.forEach(id => clearTimeout(id));
    activeTimers = [];
  }

  function addTimeout(fn, ms) {
    const id = setTimeout(fn, ms);
    activeTimers.push(id);
    return id;
  }

  function showScreen(screenKey) {
    clearAllTimers();
    Object.keys(screens).forEach(key => {
      screens[key].classList.toggle('active', key === screenKey);
    });
  }

  function startTrainer() {
    if (!isThreeInitialized) {
      initThreeEngine();
    }
    currentClipIndex = 0;
    totalScore = 0;
    clipResults = [];
    showScreen('game');
    loadClip(currentClipIndex);
  }

  function loadClip(index) {
    clearAllTimers();
    const scenario = SCENARIOS_3D[index];
    isClipActive = true;
    hasClicked = false;
    interactiveOverlay.innerHTML = '';

    hud.clipNum.textContent = `${index + 1} / ${SCENARIOS_3D.length}`;
    hud.scoreVal.textContent = totalScore;
    hud.progressFill.style.width = '0%';
    hud.feedbackText.textContent = `⌨️ WASD/D-Pad to Walk | 🖱️ Cursor to look 360° | Click to spot hazard!`;

    sceneInstance = scenario.build3D();
    clipStartTime = performance.now();

    function renderLoop(now) {
      if (!isClipActive) return;
      const elapsed = now - clipStartTime;

      const pct = Math.min(100, (elapsed / scenario.durationMs) * 100);
      hud.progressFill.style.width = `${pct}%`;

      if (sceneInstance && sceneInstance.animate) {
        sceneInstance.animate(elapsed);
      }

      // Update Movement & 360 View
      updateKeyboardMovement();
      update360Camera();

      if (threeRenderer && threeScene && threeCamera) {
        threeRenderer.render(threeScene, threeCamera);
      }

      if (elapsed >= scenario.durationMs && !hasClicked) {
        handleMissedClip();
        return;
      }

      animFrameId = requestAnimationFrame(renderLoop);
    }

    animFrameId = requestAnimationFrame(renderLoop);
  }

  function handleViewportClick(evt) {
    if (isDraggingCamera) {
      isDraggingCamera = false;
      return;
    }

    if (!isClipActive || hasClicked) return;
    hasClicked = true;

    const now = performance.now();
    const elapsedMs = now - clipStartTime;
    const scenario = SCENARIOS_3D[currentClipIndex];
    const wStart = scenario.windowStartMs;
    const wEnd = wStart + 5000;

    const container = document.getElementById('viewport-container');
    const rect = container.getBoundingClientRect();
    const clickX = evt.clientX - rect.left;
    const clickY = evt.clientY - rect.top;

    let score = 0;
    let statusTag = '';
    let feedbackMsg = '';
    let badgeClass = 'pts-0';

    if (elapsedMs < wStart) {
      score = 0;
      statusTag = 'TOO EARLY';
      feedbackMsg = 'Too early! The 3D hazard had not started developing yet.';
    } else if (elapsedMs >= wStart && elapsedMs <= wEnd) {
      const secIntoWindow = (elapsedMs - wStart) / 1000;
      const secFloor = Math.floor(secIntoWindow);
      score = Math.max(1, Math.min(5, 5 - secFloor));

      const reactSec = secIntoWindow.toFixed(2);
      if (score === 5) { statusTag = 'PERFECT (+5)'; badgeClass = 'pts-5'; feedbackMsg = `PERFECT! Reacted in ${reactSec}s.`; }
      else if (score === 4) { statusTag = 'GREAT (+4)'; badgeClass = 'pts-4'; feedbackMsg = `GREAT! Reacted in ${reactSec}s (+4 pts).`; }
      else if (score === 3) { statusTag = 'GOOD (+3)'; badgeClass = 'pts-3'; feedbackMsg = `GOOD safety awareness (+3 pts).`; }
      else if (score === 2) { statusTag = 'FAIR (+2)'; badgeClass = 'pts-2'; feedbackMsg = `FAIR response (+2 pts).`; }
      else { statusTag = 'LATE (+1)'; badgeClass = 'pts-1'; feedbackMsg = `LATE click (+1 pt).`; }
    } else {
      score = 0;
      statusTag = 'TOO LATE';
      feedbackMsg = 'Too late! The 3D hazard was already clear.';
    }

    totalScore += score;
    hud.scoreVal.textContent = totalScore;
    hud.feedbackText.textContent = feedbackMsg;

    clipResults.push({
      clipId: scenario.id,
      title: scenario.title,
      hazardName: scenario.hazardName,
      score: score,
      status: statusTag,
      badgeClass: badgeClass
    });

    renderClickFeedback(clickX, clickY, score, statusTag, badgeClass);
    addTimeout(() => advanceNextClip(), 2500);
  }

  function handleMissedClip() {
    if (hasClicked) return;
    hasClicked = true;
    isClipActive = false;

    const scenario = SCENARIOS_3D[currentClipIndex];
    hud.feedbackText.textContent = 'HAZARD MISSED! No response detected.';

    clipResults.push({
      clipId: scenario.id,
      title: scenario.title,
      hazardName: scenario.hazardName,
      score: 0,
      status: 'MISSED',
      badgeClass: 'pts-0'
    });

    addTimeout(() => advanceNextClip(), 2500);
  }

  function renderClickFeedback(x, y, score, statusTag, badgeClass) {
    const pin = document.createElement('div');
    pin.className = 'click-pin';
    pin.style.left = `${x}px`;
    pin.style.top = `${y}px`;
    pin.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#f59e0b" stroke="#000" stroke-width="2">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="2.5" fill="#000"/>
      </svg>
    `;
    interactiveOverlay.appendChild(pin);

    const popup = document.createElement('div');
    popup.className = `score-popup ${badgeClass}`;
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    popup.textContent = score > 0 ? `+${score} ${statusTag}` : `0 PTS (${statusTag})`;
    interactiveOverlay.appendChild(popup);
  }

  function advanceNextClip() {
    currentClipIndex++;
    if (currentClipIndex < SCENARIOS_3D.length) {
      loadClip(currentClipIndex);
    } else {
      finishTrainer();
    }
  }

  async function finishTrainer() {
    clearAllTimers();
    isClipActive = false;
    showScreen('results');

    const maxScore = SCENARIOS_3D.length * 5;
    const percentage = Math.round((totalScore / maxScore) * 100);

    document.getElementById('res-score-num').textContent = totalScore;
    document.getElementById('res-score-max').textContent = `OUT OF ${maxScore} (${percentage}%)`;

    const verdictTitle = document.getElementById('res-verdict-title');
    const verdictDesc = document.getElementById('res-verdict-desc');
    const saveStatus = document.getElementById('db-save-status');

    let verdictText = '';
    if (percentage >= 80) {
      verdictText = "EXCELLENT — 3D Warehouse Safety Master";
      verdictTitle.textContent = verdictText;
      verdictTitle.style.color = "#34d399";
      verdictDesc.textContent = "Outstanding safety perception! You spot industrial warehouse 3D dangers early.";
    } else if (percentage >= 50) {
      verdictText = "PASS LEVEL — Good Safety Perception";
      verdictTitle.textContent = verdictText;
      verdictTitle.style.color = "#fbbf24";
      verdictDesc.textContent = "Solid result! You passed the 3D warehouse safety perception threshold.";
    } else {
      verdictText = "NEEDS PRACTICE — Warehouse Vigilance Needed";
      verdictTitle.textContent = verdictText;
      verdictTitle.style.color = "#f87171";
      verdictDesc.textContent = "Remember: walk with WASD/D-Pad, look 360°, and click as soon as a hazard forms.";
    }

    const tbody = document.getElementById('res-table-body');
    tbody.innerHTML = '';
    clipResults.forEach(res => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>Clip ${res.clipId}</strong></td>
        <td>${res.hazardName}</td>
        <td><span class="score-pts ${res.badgeClass}">${res.score} Pts</span></td>
        <td style="color: var(--text-muted); font-size: 0.9rem;">${res.status}</td>
      `;
      tbody.appendChild(tr);
    });

    if (currentUser) {
      try {
        saveStatus.textContent = 'Saving score to SQLite database...';
        await apiCall('/game/attempt', 'POST', {
          totalScore,
          maxScore,
          percentage,
          verdict: verdictText,
          clipResults
        });
        saveStatus.textContent = '✅ Score & clip stats saved to SQLite database!';
      } catch (err) {
        saveStatus.textContent = '⚠️ Could not save score: ' + err.message;
        saveStatus.style.color = '#ef4444';
      }
    } else {
      saveStatus.textContent = '💡 Sign in or Register to save your game scores persistently to the SQLite database.';
      saveStatus.style.color = '#94a3b8';
    }
  }

  /* =========================================================================
     PLAYER HISTORY MODAL & ADMIN PORTAL
     ========================================================================= */
  const modalHistory = document.getElementById('modal-history');

  async function openPlayerHistory() {
    if (!currentUser) return;
    try {
      const historyData = await apiCall('/game/history');
      document.getElementById('ph-total-attempts').textContent = historyData.totalAttempts;
      document.getElementById('ph-best-score').textContent = `${historyData.bestScore} / 20`;
      document.getElementById('ph-avg-score').textContent = historyData.avgScore;

      const tbody = document.getElementById('ph-history-tbody');
      tbody.innerHTML = '';

      if (historyData.attempts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No past attempts recorded yet.</td></tr>`;
      } else {
        historyData.attempts.forEach(a => {
          const dateStr = new Date(a.completed_at).toLocaleDateString();
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${dateStr}</td>
            <td><span class="score-pts pts-5">${a.total_score} / ${a.max_score}</span></td>
            <td>${a.percentage}%</td>
            <td style="font-size:0.8rem;">${a.verdict}</td>
          `;
          tbody.appendChild(tr);
        });
      }

      modalHistory.classList.add('active');
    } catch (err) {
      alert('Failed to load history: ' + err.message);
    }
  }

  document.getElementById('btn-my-history').addEventListener('click', openPlayerHistory);
  document.getElementById('modal-history-close').addEventListener('click', () => modalHistory.classList.remove('active'));

  async function loadAdminDashboard() {
    showScreen('admin');
    try {
      const statsData = await apiCall('/admin/stats');
      const stats = statsData.stats;
      document.getElementById('adm-stat-players').textContent = stats.totalPlayers;
      document.getElementById('adm-stat-attempts').textContent = stats.totalAttempts;
      document.getElementById('adm-stat-avg').textContent = stats.avgScore;
      document.getElementById('adm-stat-pass').textContent = `${stats.passRate}%`;

      const playersData = await apiCall('/admin/players');
      renderAdminPlayers(playersData.players);

      const attemptsData = await apiCall('/admin/attempts');
      renderAdminAttempts(attemptsData.attempts);
    } catch (err) {
      alert('Error loading admin dashboard: ' + err.message);
    }
  }

  function renderAdminPlayers(players) {
    const tbody = document.getElementById('adm-players-tbody');
    tbody.innerHTML = '';
    if (!players || players.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No players registered yet.</td></tr>`;
      return;
    }

    players.forEach(p => {
      const tr = document.createElement('tr');
      const dateStr = new Date(p.created_at).toLocaleDateString();
      tr.innerHTML = `
        <td>#${p.id}</td>
        <td><strong>${p.username}</strong></td>
        <td>${p.email}</td>
        <td>${dateStr}</td>
        <td><span class="score-pts pts-4">${p.attempt_count}</span></td>
        <td><span class="score-pts pts-5">${p.best_score || 0} / 20</span></td>
        <td>${p.avg_score || '0.0'}</td>
        <td>
          <button class="btn btn-secondary btn-del-player" data-id="${p.id}" style="padding: 4px 8px; font-size: 0.75rem; color: #ef4444; border-color: rgba(239,68,68,0.3);">
            Delete
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-del-player').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        if (confirm(`Are you sure you want to delete player #${id} and their score history?`)) {
          try {
            await apiCall(`/admin/players/${id}`, 'DELETE');
            loadAdminDashboard();
          } catch (err) {
            showToast('Delete failed: ' + err.message, 'error');
          }
        }
      });
    });
  }

  function renderAdminAttempts(attempts) {
    const tbody = document.getElementById('adm-attempts-tbody');
    tbody.innerHTML = '';
    if (!attempts || attempts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No game attempts recorded yet.</td></tr>`;
      return;
    }

    attempts.forEach(a => {
      const dateStr = new Date(a.completed_at).toLocaleString();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${a.attempt_id}</td>
        <td><strong>${a.username}</strong> (${a.email})</td>
        <td><span class="score-pts pts-5">${a.total_score} / ${a.max_score}</span></td>
        <td>${a.percentage}%</td>
        <td style="font-size: 0.85rem;">${a.verdict}</td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">${dateStr}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* =========================================================================
     AUTH MODAL & EVENT BINDINGS
     ========================================================================= */
  const modalAuth = document.getElementById('modal-auth');
  const authAlert = document.getElementById('auth-alert');

  function openAuthModal(mode = 'login') {
    authAlert.style.display = 'none';
    modalAuth.classList.add('active');
    switchAuthTab(mode);
  }

  function closeAuthModal() {
    modalAuth.classList.remove('active');
  }

  function switchAuthTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('auth-tab-login').classList.toggle('active', isLogin);
    document.getElementById('auth-tab-register').classList.toggle('active', !isLogin);
    document.getElementById('form-login').classList.toggle('active', isLogin);
    document.getElementById('form-register').classList.toggle('active', !isLogin);
  }

  document.getElementById('btn-nav-auth').addEventListener('click', () => openAuthModal('login'));
  document.getElementById('modal-auth-close').addEventListener('click', closeAuthModal);
  document.getElementById('auth-tab-login').addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('auth-tab-register').addEventListener('click', () => switchAuthTab('register'));

  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    authAlert.style.display = 'none';
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
      const data = await apiCall('/auth/login', 'POST', { username, password });
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('hz_token', authToken);
      updateNavUI();
      closeAuthModal();

      if (currentUser.role === 'admin') {
        loadAdminDashboard();
        showToast(`Welcome back, Admin ${currentUser.username}!`, 'admin');
      } else {
        showToast(`Welcome back, ${currentUser.username}!`, 'success');
      }
    } catch (err) {
      authAlert.textContent = err.message;
      authAlert.style.display = 'block';
    }
  });

  document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    authAlert.style.display = 'none';
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    try {
      const data = await apiCall('/auth/register', 'POST', { username, email, password });
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('hz_token', authToken);
      updateNavUI();
      closeAuthModal();
      showToast(`Account created successfully! Welcome, ${currentUser.username}.`, 'success');
    } catch (err) {
      authAlert.textContent = err.message;
      authAlert.style.display = 'block';
    }
  });

  document.getElementById('btn-nav-logout').addEventListener('click', () => {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('hz_token');
    updateNavUI();
    showScreen('intro');
    showToast('Logged out successfully', 'success');
  });

  document.getElementById('btn-nav-admin').addEventListener('click', () => loadAdminDashboard());
  document.getElementById('btn-admin-close').addEventListener('click', () => showScreen('intro'));

  document.getElementById('tab-btn-players').addEventListener('click', () => {
    document.getElementById('tab-btn-players').classList.add('active');
    document.getElementById('tab-btn-attempts').classList.remove('active');
    document.getElementById('tab-view-players').classList.add('active');
    document.getElementById('tab-view-attempts').classList.remove('active');
  });

  document.getElementById('tab-btn-attempts').addEventListener('click', () => {
    document.getElementById('tab-btn-attempts').classList.add('active');
    document.getElementById('tab-btn-players').classList.remove('active');
    document.getElementById('tab-view-attempts').classList.add('active');
    document.getElementById('tab-view-players').classList.remove('active');
  });

  document.getElementById('btn-start').addEventListener('click', () => startTrainer());
  document.getElementById('btn-rules').addEventListener('click', () => showScreen('rules'));
  document.getElementById('btn-back-intro').addEventListener('click', () => showScreen('intro'));
  document.getElementById('btn-restart').addEventListener('click', () => startTrainer());
  document.getElementById('btn-home-from-res').addEventListener('click', () => showScreen('intro'));

  document.getElementById('viewport-container').addEventListener('click', handleViewportClick);

  initAuth();

})();
