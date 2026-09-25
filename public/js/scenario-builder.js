/**
 * SCENARIO HAZARD 3D OBJECT PLACEMENT & VISUAL BEACON HELPERS
 * Places 3D hazard meshes into the warehouse scene according to active scenario data.
 * Adds glowing pulsing yellow aura beacons to active unfound hazards so they are EASY TO FIND!
 * Places green safety cones over solved hazards.
 */

window.ScenarioBuilder = (function () {
  'use strict';

  let activeHazardMeshes = [];
  let solvedHazardIds = new Set();

  function clearHazards(scene) {
    activeHazardMeshes.forEach(item => {
      scene.remove(item.mesh);
      if (item.beaconMesh) scene.remove(item.beaconMesh);
      if (item.solvedMarker) scene.remove(item.solvedMarker);
    });
    activeHazardMeshes = [];
    solvedHazardIds.clear();
  }

  // BUILD HAZARD 3D MESHES WITH EASY-TO-SPOT PULSING BEACONS
  function loadScenarioHazards(scene, hazardDataList) {
    clearHazards(scene);

    hazardDataList.forEach(hData => {
      let hazardMesh;

      // Create custom 3D Mesh based on Hazard Category
      if (hData.category === 'Spills & Slip Hazards') {
        const puddleGeo = new THREE.CircleGeometry(hData.radius * 0.5, 24);
        const puddleMat = new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.05,
          metalness: 0.9,
          transparent: true,
          opacity: 0.9
        });
        hazardMesh = new THREE.Mesh(puddleGeo, puddleMat);
        hazardMesh.rotation.x = -Math.PI / 2;
        hazardMesh.position.set(hData.pos_x, hData.pos_y, hData.pos_z);
      }
      else if (hData.category === 'Electrical & Cable Risks') {
        const cableGeo = new THREE.CylinderGeometry(0.06, 0.06, 4.0, 12);
        const cableMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
        hazardMesh = new THREE.Mesh(cableGeo, cableMat);
        hazardMesh.rotation.z = Math.PI / 2;
        hazardMesh.position.set(hData.pos_x, hData.pos_y, hData.pos_z);
      }
      else if (hData.category === 'Shelving & Structural Damage') {
        const damageGroup = new THREE.Group();
        const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.8, 8);
        const damageMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
        const postMesh = new THREE.Mesh(postGeo, damageMat);
        postMesh.rotation.z = 0.3;
        damageGroup.add(postMesh);

        const tagGeo = new THREE.BoxGeometry(0.5, 0.5, 0.05);
        const tagMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
        const tagMesh = new THREE.Mesh(tagGeo, tagMat);
        tagMesh.position.set(0.2, 0.5, 0);
        damageGroup.add(tagMesh);

        damageGroup.position.set(hData.pos_x, hData.pos_y, hData.pos_z);
        hazardMesh = damageGroup;
      }
      else if (hData.category === 'Fire & Emergency Obstructions' || hData.category === 'Blocked Walkway & Debris') {
        const blockGroup = new THREE.Group();
        const boxMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7 });
        
        for (let i = 0; i < 3; i++) {
          const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 1.0), boxMat);
          box.position.set((i % 2) * 0.4, i * 0.7, Math.floor(i / 2) * 0.4);
          blockGroup.add(box);
        }
        blockGroup.position.set(hData.pos_x, hData.pos_y, hData.pos_z);
        hazardMesh = blockGroup;
      }
      else if (hData.category === 'Forklift & Vehicle Risks') {
        const flGroup = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.3 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 2.2), bodyMat);
        body.position.y = 0.5;
        flGroup.add(body);

        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), new THREE.MeshStandardMaterial({ color: 0xd97706 }));
        crate.position.set(0, 1.6, -1.4);
        flGroup.add(crate);

        flGroup.position.set(hData.pos_x, hData.pos_y, hData.pos_z);
        hazardMesh = flGroup;
      }
      else {
        const crateMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 });
        hazardMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crateMat);
        hazardMesh.position.set(hData.pos_x, hData.pos_y, hData.pos_z);
        hazardMesh.rotation.z = 0.2;
      }

      // Attach Metadata
      hazardMesh.userData = {
        hazardId: hData.id,
        hazardKey: hData.hazard_key,
        hazardName: hData.name,
        category: hData.category,
        data: hData
      };

      scene.add(hazardMesh);

      // CREATE GLOWING PULSING BEACON (MAKES HAZARDS EASY TO FIND!)
      const beaconGeo = new THREE.RingGeometry(0.8, 1.4, 16);
      const beaconMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      });
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
      beaconMesh.rotation.x = -Math.PI / 2;
      beaconMesh.position.set(hData.pos_x, 0.05, hData.pos_z);
      scene.add(beaconMesh);

      activeHazardMeshes.push({
        id: hData.id,
        mesh: hazardMesh,
        beaconMesh,
        data: hData,
        solved: false,
        solvedMarker: null
      });
    });

    return activeHazardMeshes;
  }

  // PLACE GREEN SAFETY CONE ON SOLVED HAZARD & REMOVE YELLOW BEACON
  function markHazardAsSolved(scene, hazardId) {
    solvedHazardIds.add(hazardId);
    const item = activeHazardMeshes.find(h => h.id === hazardId);
    if (!item) return;

    item.solved = true;

    // Remove yellow pulsing beacon
    if (item.beaconMesh) {
      scene.remove(item.beaconMesh);
      item.beaconMesh = null;
    }

    // Build Green Safety Cone Marker
    const coneGroup = new THREE.Group();
    const coneGeo = new THREE.ConeGeometry(0.35, 0.9, 16);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3 });
    const coneMesh = new THREE.Mesh(coneGeo, coneMat);
    coneMesh.position.y = 0.45;
    coneGroup.add(coneMesh);

    const checkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const checkTag = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.05), checkMat);
    checkTag.position.set(0, 1.0, 0);
    coneGroup.add(checkTag);

    coneGroup.position.set(item.data.pos_x + 0.6, 0, item.data.pos_z + 0.6);
    scene.add(coneGroup);
    item.solvedMarker = coneGroup;
  }

  function isHazardSolved(hazardId) {
    return solvedHazardIds.has(hazardId);
  }

  return {
    loadScenarioHazards,
    clearHazards,
    markHazardAsSolved,
    isHazardSolved,
    getActiveHazardMeshes: () => activeHazardMeshes
  };
})();
