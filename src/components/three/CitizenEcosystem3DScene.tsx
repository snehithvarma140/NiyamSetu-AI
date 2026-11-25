import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Compass, Orbit, RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface CivicStageMeta {
  stage: number;
  id: string;
  label: string;
  subtitle: string;
  angle: number;
  color: number;
}

const CIVIC_STAGES: CivicStageMeta[] = [
  {
    stage: 1,
    id: 'vault',
    label: '01 · Document Vault',
    subtitle: 'Aadhaar, Income, Marks, Caste & Bank Proofs',
    angle: 0,
    color: 0x06b6d4,
  },
  {
    stage: 2,
    id: 'eligibility',
    label: '02 · Eligibility Rules',
    subtitle: 'Income ceiling, percentage cutoff & domicile rules',
    angle: (Math.PI * 2) / 5,
    color: 0x10b981,
  },
  {
    stage: 3,
    id: 'procedures',
    label: '03 · Portal & OTR Filing',
    subtitle: 'NSP OTR, ePass / State Portal registration',
    angle: (Math.PI * 4) / 5,
    color: 0xf59e0b,
  },
  {
    stage: 4,
    id: 'formsathi',
    label: '04 · FormSathi Scrutiny',
    subtitle: 'Bonafide & Mandal / District Welfare review',
    angle: (Math.PI * 6) / 5,
    color: 0x38bdf8,
  },
  {
    stage: 5,
    id: 'dbt',
    label: '05 · DBT Bank Treasury',
    subtitle: 'NPCI Aadhaar mapper & direct credit release',
    angle: (Math.PI * 8) / 5,
    color: 0xa78bfa,
  },
];

interface CitizenEcosystem3DSceneProps {
  activeStage?: number;
  onSelectStage?: (stage: number) => void;
  schemeCode?: string;
}

function createPlazaTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 512);

  // Concentric civic stone rings
  const cx = 256;
  const cy = 256;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.lineWidth = 2;
  [72, 132, 194, 240].forEach((r) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // 5 radial avenue lines
  ctx.strokeStyle = 'rgba(20, 184, 166, 0.16)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44);
    ctx.lineTo(cx + Math.cos(a) * 246, cy + Math.sin(a) * 246);
    ctx.stroke();
  }

  // Subtle tile noise
  ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
  for (let i = 0; i < 600; i++) {
    const x = (Math.sin(i * 19.37) * 0.5 + 0.5) * 512;
    const y = (Math.cos(i * 43.11) * 0.5 + 0.5) * 512;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.65)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.25)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export const CitizenEcosystem3DScene: React.FC<CitizenEcosystem3DSceneProps> = ({
  activeStage = 1,
  onSelectStage,
  schemeCode = 'PM-01',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hoveredStage, setHoveredStage] = useState<CivicStageMeta | null>(null);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const autoOrbitRef = useRef(autoOrbit);
  autoOrbitRef.current = autoOrbit;
  const activeStageRef = useRef(activeStage);
  const onSelectRef = useRef(onSelectStage);
  onSelectRef.current = onSelectStage;

  const focusPresetFnRef = useRef<((stageNum: number | null) => void) | null>(null);

  useEffect(() => {
    activeStageRef.current = activeStage;
    focusPresetFnRef.current?.(activeStage);
  }, [activeStage]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let rafId = 0;

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 340);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const gl = renderer.getContext();
    if (!gl) {
      renderer.dispose();
      setWebglUnavailable(true);
      return;
    }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    const isSoftwareGl = /swiftshader|llvmpipe|software/i.test(rendererStr);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftwareGl;
    if (!isSoftwareGl) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    scene.fog = new THREE.FogExp2(0x0b1220, 0.028);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.75;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    const overviewCamPos = new THREE.Vector3(0, 6.4, 11.8);
    const overviewTarget = new THREE.Vector3(0, 0.75, 0);
    camera.position.copy(overviewCamPos);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4.8;
    controls.maxDistance = 19;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.target.copy(overviewTarget);

    // Smooth camera preset damping state
    let transitionActive = false;
    const goalCamPos = overviewCamPos.clone();
    const goalTarget = overviewTarget.clone();

    const orbitRadius = 4.6;
    focusPresetFnRef.current = (stageNum: number | null) => {
      if (!stageNum) {
        goalCamPos.copy(overviewCamPos);
        goalTarget.copy(overviewTarget);
        transitionActive = true;
        return;
      }
      const meta = CIVIC_STAGES.find((s) => s.stage === stageNum);
      if (!meta) return;
      const nx = Math.cos(meta.angle) * orbitRadius;
      const nz = Math.sin(meta.angle) * orbitRadius;
      goalTarget.set(nx * 0.72, 0.85, nz * 0.72);
      goalCamPos.set(
        nx + Math.cos(meta.angle + 0.5) * 4.5,
        4.1,
        nz + Math.sin(meta.angle + 0.5) * 4.5
      );
      transitionActive = true;
    };

    const onControlStart = () => {
      transitionActive = false;
    };
    controls.addEventListener('start', onControlStart);

    // Lighting: warm key + cool hemisphere + gentle rim
    const hemi = new THREE.HemisphereLight(0xbae6fd, 0x0f172a, 0.65);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    keyLight.position.set(6, 11, 7);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 30;
      keyLight.shadow.camera.left = -9;
      keyLight.shadow.camera.right = 9;
      keyLight.shadow.camera.top = 9;
      keyLight.shadow.camera.bottom = -9;
      keyLight.shadow.bias = -0.0004;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x2dd4bf, 1.15);
    rimLight.position.set(-7, 5, -7);
    scene.add(rimLight);

    // Ground Plaza with CanvasTexture + max anisotropy
    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const plazaTex = createPlazaTexture(maxAniso);
    const contactTex = createContactShadowTexture();

    const segBase = isSoftwareGl ? 32 : 64;
    const floorGeo = new THREE.CylinderGeometry(8.2, 8.6, 0.24, segBase);
    const floorMat = new THREE.MeshStandardMaterial({
      map: plazaTex,
      roughness: 0.75,
      metalness: 0.2,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.12;
    floorMesh.receiveShadow = !isSoftwareGl;
    scene.add(floorMesh);

    const contactMat = new THREE.MeshBasicMaterial({
      map: contactTex,
      transparent: true,
      depthWrite: false,
    });
    const contactPlaneGeo = new THREE.PlaneGeometry(2.6, 2.6);

    const disposables: Array<{ dispose: () => void }> = [
      envTarget,
      plazaTex,
      contactTex,
      floorGeo,
      floorMat,
      contactMat,
      contactPlaneGeo,
    ];

    // Central Civic Identity Beacon (5-part composite Group, bottom-center pivot y=0)
    const beaconGroup = new THREE.Group();
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.32,
      metalness: 0.82,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.24,
      metalness: 0.86,
    });
    const beaconPrismMat = new THREE.MeshPhysicalMaterial({
      color: 0x14b8a6,
      emissive: 0x0f766e,
      emissiveIntensity: 0.42,
      roughness: 0.16,
      metalness: 0.2,
      clearcoat: 1,
    });

    const bShadow = new THREE.Mesh(contactPlaneGeo, contactMat);
    bShadow.rotation.x = -Math.PI / 2;
    bShadow.position.y = 0.012;
    bShadow.scale.setScalar(1.3);
    beaconGroup.add(bShadow);

    const bBaseGeo = new THREE.CylinderGeometry(1.1, 1.35, 0.34, isSoftwareGl ? 16 : 32);
    const bBase = new THREE.Mesh(bBaseGeo, darkMetalMat);
    bBase.position.y = 0.17;
    bBase.castShadow = !isSoftwareGl;
    bBase.receiveShadow = !isSoftwareGl;
    beaconGroup.add(bBase);

    const bCollarGeo = new THREE.TorusGeometry(0.88, 0.06, 12, isSoftwareGl ? 24 : 48);
    const bCollar = new THREE.Mesh(bCollarGeo, brassMat);
    bCollar.rotation.x = Math.PI / 2;
    bCollar.position.y = 0.38;
    beaconGroup.add(bCollar);

    const bPrismGeo = new THREE.OctahedronGeometry(0.68, 0);
    const bPrism = new THREE.Mesh(bPrismGeo, beaconPrismMat);
    bPrism.position.y = 1.48;
    bPrism.castShadow = !isSoftwareGl;
    beaconGroup.add(bPrism);

    const bOrbitGeo = new THREE.TorusGeometry(1.15, 0.04, 12, isSoftwareGl ? 28 : 56);
    const bOrbit = new THREE.Mesh(bOrbitGeo, brassMat);
    bOrbit.position.y = 1.48;
    beaconGroup.add(bOrbit);

    scene.add(beaconGroup);
    disposables.push(
      darkMetalMat,
      brassMat,
      beaconPrismMat,
      bBaseGeo,
      bCollarGeo,
      bPrismGeo,
      bOrbitGeo
    );

    // 5 Composite Civic Workflow Landmarks (3-6 primitives each, bottom-center pivot y=0)
    const clickableTargets: THREE.Object3D[] = [];
    const plinthGeo = new THREE.CylinderGeometry(0.76, 0.9, 0.22, 8);
    const stepGeo = new THREE.CylinderGeometry(0.54, 0.68, 0.2, 8);
    const pulseGeo = new THREE.SphereGeometry(0.095, 12, 12);
    disposables.push(plinthGeo, stepGeo, pulseGeo);

    const stageRecords: Array<{
      meta: CivicStageMeta;
      finial: THREE.Mesh;
      haloMat: THREE.MeshStandardMaterial;
      curve: THREE.CatmullRomCurve3;
      pulseMesh: THREE.Mesh;
      baseFinialY: number;
    }> = [];

    CIVIC_STAGES.forEach((meta) => {
      const gx = Math.cos(meta.angle) * orbitRadius;
      const gz = Math.sin(meta.angle) * orbitRadius;

      const group = new THREE.Group();
      group.position.set(gx, 0, gz);

      const shadow = new THREE.Mesh(contactPlaneGeo, contactMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.015;
      group.add(shadow);

      const plinth = new THREE.Mesh(plinthGeo, darkMetalMat);
      plinth.position.y = 0.11;
      plinth.castShadow = !isSoftwareGl;
      plinth.receiveShadow = !isSoftwareGl;
      group.add(plinth);

      const step = new THREE.Mesh(stepGeo, darkMetalMat);
      step.position.y = 0.32;
      step.castShadow = !isSoftwareGl;
      group.add(step);

      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.38,
        metalness: 0.72,
      });
      const pillarGeo =
        meta.stage === 1
          ? new THREE.BoxGeometry(0.62, 0.72, 0.52)
          : meta.stage === 3
          ? new THREE.CylinderGeometry(0.26, 0.42, 0.85, 6)
          : new THREE.CylinderGeometry(0.32, 0.38, 0.76, 10);
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.y = 0.78;
      pillar.castShadow = !isSoftwareGl;
      group.add(pillar);

      const haloGeo = new THREE.TorusGeometry(0.54, 0.04, 10, isSoftwareGl ? 20 : 36);
      const haloMat = new THREE.MeshStandardMaterial({
        color: meta.color,
        emissive: meta.color,
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.75,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 1.18;
      group.add(halo);

      const finialGeo =
        meta.stage === 5
          ? new THREE.SphereGeometry(0.32, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65)
          : new THREE.OctahedronGeometry(0.32, 0);
      const finialMat = new THREE.MeshPhysicalMaterial({
        color: meta.color,
        emissive: meta.color,
        emissiveIntensity: 0.28,
        roughness: 0.16,
        metalness: 0.25,
        clearcoat: 0.9,
      });
      const finial = new THREE.Mesh(finialGeo, finialMat);
      const baseFinialY = 1.56;
      finial.position.y = baseFinialY;
      finial.castShadow = !isSoftwareGl;
      group.add(finial);

      const hitGeo = new THREE.CylinderGeometry(0.96, 0.96, 2.0, 10);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.y = 0.95;
      hitMesh.userData.stageMeta = meta;
      group.add(hitMesh);
      clickableTargets.push(hitMesh);

      scene.add(group);

      // Curved Tube conduit from Beacon to Stage Landmark
      const startPt = new THREE.Vector3(Math.cos(meta.angle) * 1.1, 0.45, Math.sin(meta.angle) * 1.1);
      const midPt = new THREE.Vector3(Math.cos(meta.angle) * 2.8, 0.95, Math.sin(meta.angle) * 2.8);
      const endPt = new THREE.Vector3(
        Math.cos(meta.angle) * (orbitRadius - 0.7),
        0.45,
        Math.sin(meta.angle) * (orbitRadius - 0.7)
      );
      const curve = new THREE.CatmullRomCurve3([startPt, midPt, endPt]);
      const tubeGeo = new THREE.TubeGeometry(curve, isSoftwareGl ? 16 : 26, 0.04, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        emissive: meta.color,
        emissiveIntensity: 0.22,
        roughness: 0.35,
        metalness: 0.75,
      });
      scene.add(new THREE.Mesh(tubeGeo, tubeMat));

      const pulseMat = new THREE.MeshBasicMaterial({ color: meta.color });
      const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
      scene.add(pulseMesh);

      disposables.push(
        pillarMat,
        pillarGeo,
        haloGeo,
        haloMat,
        finialGeo,
        finialMat,
        hitGeo,
        hitMat,
        tubeGeo,
        tubeMat,
        pulseMat
      );

      stageRecords.push({
        meta,
        finial,
        haloMat,
        curve,
        pulseMesh,
        baseFinialY,
      });
    });

    // Raycasting
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPos = { x: 0, y: 0 };

    const updatePointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1;
    };

    let lastHover = 0;
    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHover < 40) return;
      lastHover = now;
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableTargets, false);
      if (hits.length > 0) {
        const meta = hits[0].object.userData.stageMeta as CivicStageMeta | undefined;
        setHoveredStage(meta || null);
        canvas.style.cursor = 'pointer';
      } else {
        setHoveredStage(null);
        canvas.style.cursor = 'grab';
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) return;
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableTargets, false);
      if (hits.length > 0) {
        const meta = hits[0].object.userData.stageMeta as CivicStageMeta | undefined;
        if (meta) {
          activeStageRef.current = meta.stage;
          focusPresetFnRef.current?.(meta.stage);
          onSelectRef.current?.(meta.stage);
        }
      }
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let resizeRafId = 0;
    let lastW = 0;
    let lastH = 0;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || disposed) return;
      const w = Math.round(Math.max(entry.contentRect.width, 280));
      const h = Math.round(Math.max(entry.contentRect.height, 260));
      if (w === lastW && h === lastH) return;
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(() => {
        if (disposed) return;
        lastW = w;
        lastH = h;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
    });
    resizeObserver.observe(container);

    // Pre-allocated scratch vector for zero GC in loop
    const _tmpVec3 = new THREE.Vector3();
    const clock = new THREE.Clock();

    const stepFrame = () => {
      if (disposed) return;

      const delta = Math.min(clock.getDelta(), 0.08);
      const elapsed = clock.getElapsedTime();
      const focused = activeStageRef.current;

      bPrism.rotation.y += delta * 0.55;
      bPrism.position.y = 1.48 + Math.sin(elapsed * 2.0) * 0.055;
      bOrbit.rotation.x = Math.sin(elapsed * 0.65) * 0.4;
      bOrbit.rotation.z += delta * 0.42;

      if (autoOrbitRef.current && !transitionActive) {
        scene.rotation.y += delta * 0.08;
      }

      if (transitionActive) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, goalCamPos.x, 4.5, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, goalCamPos.y, 4.5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, goalCamPos.z, 4.5, delta);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, goalTarget.x, 4.5, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, goalTarget.y, 4.5, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, goalTarget.z, 4.5, delta);
        if (camera.position.distanceTo(goalCamPos) < 0.04) {
          transitionActive = false;
        }
      }

      for (let i = 0; i < stageRecords.length; i++) {
        const rec = stageRecords[i];
        const isCurrent = rec.meta.stage === focused;
        rec.finial.rotation.y += delta * (isCurrent ? 1.25 : 0.45);
        rec.finial.position.y = rec.baseFinialY + Math.sin(elapsed * 2.1 + i) * 0.045;
        rec.haloMat.emissiveIntensity = THREE.MathUtils.damp(
          rec.haloMat.emissiveIntensity,
          isCurrent ? 1.15 : 0.25,
          6,
          delta
        );

        const t = (elapsed * (isCurrent ? 0.52 : 0.24) + i * 0.2) % 1;
        rec.curve.getPointAt(t, _tmpVec3);
        rec.pulseMesh.position.copy(_tmpVec3);
      }

      controls.update();
      renderer.render(scene, camera);
    };

    const scheduleNext = () => {
      if (disposed) return;
      if (isSoftwareGl && typeof (renderer as unknown as { afterDraw?: (cb: () => void) => void }).afterDraw === 'function') {
        (renderer as unknown as { afterDraw: (cb: () => void) => void }).afterDraw(() => {
          rafId = requestAnimationFrame(tick);
        });
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    const tick = () => {
      if (disposed) return;
      stepFrame();
      scheduleNext();
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  const currentStageMeta = CIVIC_STAGES.find((s) => s.stage === activeStage) || CIVIC_STAGES[0];

  return (
    <div className="relative w-full h-[350px] sm:h-[390px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 select-none">
      <div ref={mountRef} className="w-full h-full" />

      {webglUnavailable && (
        <div className="absolute inset-0 z-20 flex flex-col justify-center gap-4 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/50 p-6">
          <div className="text-xs font-mono text-cyan-300 uppercase tracking-wider">
            {schemeCode} · Interactive Citizen Workflow Map
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            {CIVIC_STAGES.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onSelectStage?.(st.stage)}
                className={`text-left rounded-lg border p-3 transition-colors cursor-pointer ${
                  activeStage === st.stage
                    ? 'border-cyan-400 bg-cyan-950/60 text-white'
                    : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-cyan-500/60'
                }`}
              >
                <div className="text-xs font-bold text-cyan-300">{st.label}</div>
                <div className="text-[11px] text-slate-400 mt-1">{st.subtitle}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {contextLost && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/92 text-slate-200 text-sm p-6 text-center">
          3D viewport paused while restoring WebGL context.
        </div>
      )}

      {/* Semantic HUD Info Card (solid/high-opacity, no backdrop-filter) */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none max-w-[270px] space-y-1.5">
        <div className="rounded-md bg-slate-950/90 border border-slate-700/80 px-3 py-2 text-xs text-slate-100 shadow-sm">
          <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
            <Compass className="w-3.5 h-3.5 shrink-0" />
            <span>{schemeCode} · 3D Citizen Workflow Map</span>
          </div>
          <div className="text-[11px] font-medium text-white mt-1">{currentStageMeta.label}</div>
          <div className="text-[11px] text-slate-400">{currentStageMeta.subtitle}</div>
          {hoveredStage && hoveredStage.stage !== activeStage && (
            <div className="text-[11px] text-amber-300 mt-1">
              Click to inspect: {hoveredStage.label}
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Bottom Control Dock (<= 15% height) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 max-w-[96%]">
        {dockCollapsed ? (
          <button
            type="button"
            onClick={() => setDockCollapsed(false)}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-950/92 border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-400 cursor-pointer"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span>3D Stage Controls</span>
          </button>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-1 rounded-md bg-slate-950/92 border border-slate-700 px-2 py-1.5 text-[11px] text-slate-200 shadow-lg">
            {CIVIC_STAGES.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  focusPresetFnRef.current?.(st.stage);
                  onSelectStage?.(st.stage);
                }}
                className={`px-2 py-1 rounded font-mono font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                  activeStage === st.stage
                    ? 'bg-cyan-500 text-slate-950'
                    : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                0{st.stage}
              </button>
            ))}
            <span className="h-3.5 w-px bg-slate-700 mx-0.5" />
            <button
              type="button"
              onClick={() => focusPresetFnRef.current?.(null)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3 text-cyan-300" />
              <span>Overview</span>
            </button>
            <button
              type="button"
              onClick={() => setAutoOrbit((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded cursor-pointer whitespace-nowrap ${
                autoOrbit ? 'bg-cyan-500/20 text-cyan-200' : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <Orbit className="w-3 h-3" />
              <span>{autoOrbit ? 'Orbit On' : 'Orbit Off'}</span>
            </button>
            <button
              type="button"
              onClick={() => setDockCollapsed(true)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              aria-label="Collapse 3D stage dock"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
