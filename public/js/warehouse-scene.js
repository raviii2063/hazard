/**
 * 360° WAREHOUSE 3D ENVIRONMENT BUILDER (Three.js)
 * Generates realistic procedural warehouse 3D assets:
 * Epoxy floor, pedestrian zebra crossings, metal racks, pallets, boxes, chemical drums,
 * forklifts, pedestrian workers, and safety signage.
 */

window.WarehouseSceneBuilder = (function () {
  'use strict';

  // Helper texture generators using HTML5 Canvas for zero external asset dependencies
  function createFloorCanvasTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Base concrete epoxy
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 1024, 1024);

    // Floor tile grid
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    const tileSize = 64;
    for (let x = 0; x <= 1024; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1024);
      ctx.stroke();
    }
    for (let y = 0; y <= 1024; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }

    // Yellow Pedestrian Safety Lanes
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 16;
    ctx.strokeRect(64, 64, 896, 896);

    // Zebra Crossings
    ctx.fillStyle = '#f59e0b';
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(200 + i * 80, 450, 40, 120);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 8);
    return texture;
  }

  function createBoxCanvasTexture(label, color = '#d97706') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, 256, 256);

    // Cardboard seam lines
    ctx.beginPath();
    ctx.moveTo(0, 128);
    ctx.lineTo(256, 128);
    ctx.stroke();

    // Warning Label Badge
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(30, 30, 80, 80);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('⚠️', 54, 80);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(label || 'AUTO PARTS', 30, 200);

    return new THREE.CanvasTexture(canvas);
  }

  function createHazardStripeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#000000';
    for (let i = -256; i < 512; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 20, 0);
      ctx.lineTo(i - 40, 256);
      ctx.lineTo(i - 60, 256);
      ctx.closePath();
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  // BUILD COMPLETE WAREHOUSE SCENE
  function buildWarehouseEnvironment(scene) {
    const floorTexture = createFloorCanvasTexture();
    const boxTexture = createBoxCanvasTexture('FRAGILE');
    const stripeTexture = createHazardStripeTexture();

    // Materials
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.3,
      metalness: 0.1
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8
    });
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.9
    });
    const rackPostMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8, // Industrial blue vertical posts
      roughness: 0.4
    });
    const rackBeamMat = new THREE.MeshStandardMaterial({
      color: 0xea580c, // Industrial orange horizontal beams
      roughness: 0.4
    });
    const palletMat = new THREE.MeshStandardMaterial({
      color: 0x854d0e,
      roughness: 0.9
    });
    const boxMat = new THREE.MeshStandardMaterial({
      map: boxTexture,
      roughness: 0.7
    });

    // 1. FLOOR (30m x 60m)
    const floorGeo = new THREE.PlaneGeometry(30, 60);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, -25);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // 2. CEILING (30m x 60m at Height 8m)
    const ceilingGeo = new THREE.PlaneGeometry(30, 60);
    const ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.position.set(0, 8, -25);
    scene.add(ceilingMesh);

    // 3. WAREHOUSE WALLS
    // Back Wall
    const backWallGeo = new THREE.PlaneGeometry(30, 8);
    const backWallMesh = new THREE.Mesh(backWallGeo, wallMat);
    backWallMesh.position.set(0, 4, -55);
    scene.add(backWallMesh);

    // Left Wall
    const leftWallGeo = new THREE.PlaneGeometry(60, 8);
    const leftWallMesh = new THREE.Mesh(leftWallGeo, wallMat);
    leftWallMesh.rotation.y = Math.PI / 2;
    leftWallMesh.position.set(-15, 4, -25);
    scene.add(leftWallMesh);

    // Right Wall
    const rightWallGeo = new THREE.PlaneGeometry(60, 8);
    const rightWallMesh = new THREE.Mesh(rightWallGeo, wallMat);
    rightWallMesh.rotation.y = -Math.PI / 2;
    rightWallMesh.position.set(15, 4, -25);
    scene.add(rightWallMesh);

    // Front Wall
    const frontWallGeo = new THREE.PlaneGeometry(30, 8);
    const frontWallMesh = new THREE.Mesh(frontWallGeo, wallMat);
    frontWallMesh.rotation.y = Math.PI;
    frontWallMesh.position.set(0, 4, 5);
    scene.add(frontWallMesh);

    // 4. CEILING TRUSSES & INDUSTRIAL LED LIGHTS
    for (let z = -50; z <= 0; z += 10) {
      // Steel Truss Beam across ceiling
      const trussGeo = new THREE.BoxGeometry(30, 0.4, 0.4);
      const trussMesh = new THREE.Mesh(trussGeo, rackPostMat);
      trussMesh.position.set(0, 7.8, z);
      scene.add(trussMesh);

      // LED High-Bay Light Fixtures
      for (let x of [-8, 0, 8]) {
        const lightGeo = new THREE.CylinderGeometry(0.6, 0.8, 0.3, 16);
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const lightMesh = new THREE.Mesh(lightGeo, lightMat);
        lightMesh.position.set(x, 7.5, z);
        scene.add(lightMesh);

        const pointLight = new THREE.PointLight(0xfffbeb, 0.8, 18);
        pointLight.position.set(x, 7.0, z);
        scene.add(pointLight);
      }
    }

    // Ambient Lighting
    const ambientLight = new THREE.AmbientLight(0x94a3b8, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // 5. STORAGE RACKS GENERATOR
    function buildStorageRackRow(startX, startZ, length, heightLevels = 3) {
      const rackGroup = new THREE.Group();

      for (let i = 0; i <= length; i += 4) {
        // Vertical Posts (Left & Right of Bay)
        for (let pz of [0, 1.4]) {
          const postGeo = new THREE.BoxGeometry(0.12, 6, 0.12);
          const postMesh = new THREE.Mesh(postGeo, rackPostMat);
          postMesh.position.set(startX, 3, startZ - i + pz);
          rackGroup.add(postMesh);
        }

        // Horizontal Beams at Level 1, 2, 3
        if (i < length) {
          for (let level = 1; level <= heightLevels; level++) {
            const beamY = level * 1.8;

            const beamFrontGeo = new THREE.BoxGeometry(0.1, 0.12, 4);
            const beamFront = new THREE.Mesh(beamFrontGeo, rackBeamMat);
            beamFront.position.set(startX + 0.06, beamY, startZ - i - 2);
            rackGroup.add(beamFront);

            const beamBack = beamFront.clone();
            beamBack.position.z += 1.4;
            rackGroup.add(beamBack);

            // Wooden Pallets & Cargo Boxes on shelves
            const palletGeo = new THREE.BoxGeometry(1.2, 0.15, 1.2);
            const pallet1 = new THREE.Mesh(palletGeo, palletMat);
            pallet1.position.set(startX, beamY + 0.08, startZ - i - 1.2);
            rackGroup.add(pallet1);

            const pallet2 = pallet1.clone();
            pallet2.position.z = startZ - i - 2.8;
            rackGroup.add(pallet2);

            // Cargo Boxes
            const boxGeo = new THREE.BoxGeometry(1.0, 1.0, 1.0);
            const box1 = new THREE.Mesh(boxGeo, boxMat);
            box1.position.set(startX, beamY + 0.65, startZ - i - 1.2);
            rackGroup.add(box1);

            const box2 = new THREE.Mesh(boxGeo, boxMat);
            box2.position.set(startX, beamY + 0.65, startZ - i - 2.8);
            rackGroup.add(box2);
          }
        }
      }
      scene.add(rackGroup);
      return rackGroup;
    }

    // Build Racking Aisles
    buildStorageRackRow(-9, -6, 40, 3);
    buildStorageRackRow(-6.5, -6, 40, 3);

    buildStorageRackRow(6.5, -6, 40, 3);
    buildStorageRackRow(9, -6, 40, 3);

    // 6. FORKLIFT PROCEDURAL 3D MODELS
    function buildForklift(x, y, z, rotY = 0) {
      const forkliftGroup = new THREE.Group();

      const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
      const steelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 });

      // Chassis Body
      const bodyGeo = new THREE.BoxGeometry(1.4, 1.0, 2.4);
      const bodyMesh = new THREE.Mesh(bodyGeo, yellowMat);
      bodyMesh.position.set(0, 0.7, 0);
      forkliftGroup.add(bodyMesh);

      // Counterweight at rear
      const cwGeo = new THREE.BoxGeometry(1.4, 0.8, 0.6);
      const cwMesh = new THREE.Mesh(cwGeo, darkMat);
      cwMesh.position.set(0, 0.8, 1.1);
      forkliftGroup.add(cwMesh);

      // Cabin Roll Cage Frame
      const cageGeo = new THREE.BoxGeometry(1.2, 1.4, 1.2);
      const cageMesh = new THREE.Mesh(cageGeo, darkMat);
      cageMesh.position.set(0, 1.8, 0.1);
      forkliftGroup.add(cageMesh);

      // Amber Warning Beacon Light
      const beaconGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
      beaconMesh.position.set(0, 2.6, 0.1);
      forkliftGroup.add(beaconMesh);

      // Vertical Mast & Forks at Front
      const mastGeo = new THREE.BoxGeometry(0.8, 2.5, 0.1);
      const mastMesh = new THREE.Mesh(mastGeo, steelMat);
      mastMesh.position.set(0, 1.45, -1.25);
      forkliftGroup.add(mastMesh);

      const forkLeft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 1.2), steelMat);
      forkLeft.position.set(-0.3, 0.2, -1.8);
      forkliftGroup.add(forkLeft);

      const forkRight = forkLeft.clone();
      forkRight.position.x = 0.3;
      forkliftGroup.add(forkRight);

      // 4 Wheels
      const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
      wheelGeo.rotateZ(Math.PI / 2);
      for (let wx of [-0.75, 0.75]) {
        for (let wz of [-0.7, 0.8]) {
          const wheel = new THREE.Mesh(wheelGeo, darkMat);
          wheel.position.set(wx, 0.35, wz);
          forkliftGroup.add(wheel);
        }
      }

      forkliftGroup.position.set(x, y, z);
      forkliftGroup.rotation.y = rotY;
      scene.add(forkliftGroup);
      return forkliftGroup;
    }

    // Ambient Forklifts
    buildForklift(0, 0, -42, Math.PI);
    buildForklift(-12, 0, -35, Math.PI / 2);

    // 7. PEDESTRIAN WORKER MODELS
    function buildWorkerModel(x, y, z, rotY = 0) {
      const workerGroup = new THREE.Group();

      const vestMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5 }); // High-vis orange vest
      const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2 }); // Yellow hard hat
      const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.8 }); // Navy work trousers
      const skinMat = new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.9 });

      // Legs
      const legLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8), pantsMat);
      legLeft.position.set(-0.15, 0.4, 0);
      workerGroup.add(legLeft);

      const legRight = legLeft.clone();
      legRight.position.x = 0.15;
      workerGroup.add(legRight);

      // Torso Vest
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), vestMat);
      torso.position.set(0, 1.15, 0);
      workerGroup.add(torso);

      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), skinMat);
      head.position.set(0, 1.65, 0);
      workerGroup.add(head);

      // Safety Hard Hat
      const helmet = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.12, 16), helmetMat);
      helmet.position.set(0, 1.8, 0);
      workerGroup.add(helmet);

      workerGroup.position.set(x, y, z);
      workerGroup.rotation.y = rotY;
      scene.add(workerGroup);
      return workerGroup;
    }

    buildWorkerModel(2.0, 0, -32, -Math.PI / 4);
    buildWorkerModel(-11.5, 0, -18, Math.PI / 2);

    // 8. EMERGENCY EXIT DOOR & WALL SAFETY SIGNAGE
    const exitDoorGeo = new THREE.PlaneGeometry(1.6, 2.8);
    const exitDoorMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.4 });
    const exitDoor = new THREE.Mesh(exitDoorGeo, exitDoorMat);
    exitDoor.position.set(-9.9, 1.4, -26);
    exitDoor.rotation.y = Math.PI / 2;
    scene.add(exitDoor);

    const exitSignGeo = new THREE.BoxGeometry(0.8, 0.3, 0.1);
    const exitSignMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const exitSign = new THREE.Mesh(exitSignGeo, exitSignMat);
    exitSign.position.set(-9.8, 3.0, -26);
    exitSign.rotation.y = Math.PI / 2;
    scene.add(exitSign);
  }

  return {
    buildWarehouseEnvironment,
    createBoxCanvasTexture,
    createHazardStripeTexture
  };
})();
