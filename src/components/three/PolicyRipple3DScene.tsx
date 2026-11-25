import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Orbit, RotateCcw, Sparkles } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

interface PolicyNodeMeta {
  id: string;
  label: string;
  role: string;
  angle: number;
  color: number;
}

const NODE_DEFINITIONS: PolicyNodeMeta[] = [
  { id: 'eligibility', label: 'Eligibility Thresholds', role: 'Income & Marks Rules', angle: 0, color: 0x06b6d4 },
  { id: 'procedures', label: 'Procedure Steps', role: 'Citizen Workflow Sequence', angle: (Math.PI * 2) / 5, color: 0x10b981 },
  { id: 'documents', label: 'Required Documents', role: 'Mandatory Verification List', angle: (Math.PI * 4) / 5, color: 0xf59e0b },
  { id: 'formsathi', label: 'FormSathi Checks', role: 'Pre-Submission Readiness', angle: (Math.PI * 6) / 5, color: 0x38bdf8 },
  { id: 'alerts', label: 'Deadlines & Alerts', role: 'Citizen & Admin Notices', angle: (Math.PI * 8) / 5, color: 0xa78bfa },
];

interface PolicyRipple3DSceneProps {
  approvedAmendmentsCount: number;
  appliedImpactsCount: number;
  pulseKey: number;
}

function createFloorPatternTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cx = 256;
  const cy = 256;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.lineWidth = 2;
  [64, 128, 192, 238].forEach((r) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.strokeStyle = 'rgba(29, 78, 216, 0.25)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40);
    ctx.lineTo(cx + Math.cos(a) * 245, cy + Math.sin(a) * 245);
    ctx.stroke();
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
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.7)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.24)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export const PolicyRipple3DScene: React.FC<PolicyRipple3DSceneProps> = ({
  approvedAmendmentsCount,
  appliedImpactsCount,
  pulseKey,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [selectedNode, setSelectedNode] = useState<PolicyNodeMeta | null>(null);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [localPulse, setLocalPulse] = useState(0);

  const autoOrbitRef = useRef(autoOrbit);
  autoOrbitRef.current = autoOrbit;

  const activeStateRef = useRef({ approvedAmendmentsCount, appliedImpactsCount });
  activeStateRef.current = { approvedAmendmentsCount, appliedImpactsCount };

  const resetCameraFnRef = useRef<(() => void) | null>(null);
  const focusNodeFnRef = useRef<((meta: PolicyNodeMeta | null) => void) | null>(null);
  const triggerWaveFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    triggerWaveFnRef.current?.();
  }, [pulseKey, localPulse]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let animationId = 0;
    let disposed = false;

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 360);

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

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
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

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    scene.fog = new THREE.FogExp2(0x0b1220, 0.032);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    const defaultCamPos = new THREE.Vector3(0, 6.2, 11.4);
    const defaultTarget = new THREE.Vector3(0, 0.85, 0);
    camera.position.copy(defaultCamPos);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 5.0;
    controls.maxDistance = 19;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.target.copy(defaultTarget);

    let transitionActive = false;
    const goalCamPos = defaultCamPos.clone();
    const goalTarget = defaultTarget.clone();
    const orbitRadius = 4.6;

    focusNodeFnRef.current = (meta: PolicyNodeMeta | null) => {
      if (!meta) {
        goalCamPos.copy(defaultCamPos);
        goalTarget.copy(defaultTarget);
        transitionActive = true;
        return;
      }
      const nx = Math.cos(meta.angle) * orbitRadius;
      const nz = Math.sin(meta.angle) * orbitRadius;
      goalTarget.set(nx * 0.7, 0.9, nz * 0.7);
      goalCamPos.set(
        nx + Math.cos(meta.angle + 0.5) * 4.4,
        4.2,
        nz + Math.sin(meta.angle + 0.5) * 4.4
      );
      transitionActive = true;
    };

    resetCameraFnRef.current = () => {
      setSelectedNode(null);
      focusNodeFnRef.current?.(null);
    };

    const onControlStart = () => {
      transitionActive = false;
    };
    controls.addEventListener('start', onControlStart);

    // Three-Point Studio Lighting
    const hemiFill = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.58);
    scene.add(hemiFill);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.1);
    keyLight.position.set(6, 11, 7);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 30;
      const d = 9;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0004;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x22d3ee, 1.3);
    rimLight.position.set(-7, 6, -8);
    scene.add(rimLight);

    // Architectural Ground Disc + CanvasTexture + Contact Shadow Material
    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const floorTex = createFloorPatternTexture(maxAniso);
    const contactShadowTex = createContactShadowTexture();

    const floorGeo = new THREE.CylinderGeometry(8.2, 8.5, 0.22, isSoftwareGl ? 32 : 64);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.72,
      metalness: 0.25,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.11;
    floorMesh.receiveShadow = !isSoftwareGl;
    scene.add(floorMesh);

    const contactPlaneGeo = new THREE.PlaneGeometry(2.5, 2.5);
    const contactMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
    });

    const disposables: Array<{ dispose: () => void }> = [
      floorTex,
      contactShadowTex,
      floorGeo,
      floorMat,
      contactPlaneGeo,
      contactMat,
      envTarget,
    ];
    const clickableTargets: THREE.Object3D[] = [];

    // Central Rule Core Assembly
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, 0, 0);

    const coreShadow = new THREE.Mesh(contactPlaneGeo, contactMat);
    coreShadow.rotation.x = -Math.PI / 2;
    coreShadow.position.y = 0.015;
    coreShadow.scale.setScalar(1.35);
    coreGroup.add(coreShadow);

    const lathePoints = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(1.45, 0.0),
      new THREE.Vector2(1.38, 0.22),
      new THREE.Vector2(0.95, 0.36),
      new THREE.Vector2(0.88, 0.62),
      new THREE.Vector2(0.0, 0.62),
    ];
    const basePedestalGeo = new THREE.LatheGeometry(lathePoints, isSoftwareGl ? 20 : 32);
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.32,
      metalness: 0.85,
    });
    const pedestalMesh = new THREE.Mesh(basePedestalGeo, darkMetalMat);
    pedestalMesh.castShadow = !isSoftwareGl;
    pedestalMesh.receiveShadow = !isSoftwareGl;
    coreGroup.add(pedestalMesh);

    const collarGeo = new THREE.TorusGeometry(1.02, 0.07, 14, isSoftwareGl ? 28 : 48);
    const tealAccentMat = new THREE.MeshStandardMaterial({
      color: 0x0d9488,
      emissive: 0x0f766e,
      emissiveIntensity: 0.35,
      roughness: 0.28,
      metalness: 0.75,
    });
    const collarMesh = new THREE.Mesh(collarGeo, tealAccentMat);
    collarMesh.rotation.x = Math.PI / 2;
    collarMesh.position.y = 0.64;
    coreGroup.add(collarMesh);

    const crystalGeo = new THREE.OctahedronGeometry(0.74, 0);
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x2dd4bf,
      emissive: 0x0d9488,
      emissiveIntensity: 0.32,
      roughness: 0.14,
      metalness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    });
    const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    crystalMesh.position.y = 1.68;
    crystalMesh.castShadow = !isSoftwareGl;
    coreGroup.add(crystalMesh);

    const ringGeo = new THREE.TorusGeometry(1.28, 0.055, 14, isSoftwareGl ? 32 : 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.88,
    });
    const gyroRing = new THREE.Mesh(ringGeo, ringMat);
    gyroRing.position.y = 1.68;
    coreGroup.add(gyroRing);

    const spireGeo = new THREE.CylinderGeometry(0.06, 0.14, 0.65, 12);
    const spireMesh = new THREE.Mesh(spireGeo, darkMetalMat);
    spireMesh.position.y = 0.92;
    coreGroup.add(spireMesh);

    const satGeo = new THREE.SphereGeometry(0.11, 14, 14);
    const satMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.5,
    });
    const satellitesGroup = new THREE.Group();
    satellitesGroup.position.y = 1.68;
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(satGeo, satMat);
      const a = (i * Math.PI) / 2;
      s.position.set(Math.cos(a) * 1.28, 0, Math.sin(a) * 1.28);
      satellitesGroup.add(s);
    }
    coreGroup.add(satellitesGroup);
    scene.add(coreGroup);

    disposables.push(
      basePedestalGeo,
      darkMetalMat,
      collarGeo,
      tealAccentMat,
      crystalGeo,
      crystalMat,
      ringGeo,
      ringMat,
      spireGeo,
      satGeo,
      satMat
    );

    // 5 Downstream Policy Assemblies + TubeGeometry Conduits + Pulses
    const nodeRecords: Array<{
      meta: PolicyNodeMeta;
      group: THREE.Group;
      cap: THREE.Mesh;
      haloMat: THREE.MeshStandardMaterial;
      curve: THREE.CatmullRomCurve3;
      pulseMesh: THREE.Mesh;
      phaseOffset: number;
    }> = [];

    const plinthGeo = new THREE.CylinderGeometry(0.72, 0.86, 0.24, 8);
    const pillarGeo = new THREE.CylinderGeometry(0.34, 0.42, 0.85, 8);
    const capGeo = new THREE.DodecahedronGeometry(0.36, 0);
    const haloGeo = new THREE.TorusGeometry(0.56, 0.04, 12, isSoftwareGl ? 20 : 36);
    const pulseSphereGeo = new THREE.SphereGeometry(0.1, 12, 12);
    disposables.push(plinthGeo, pillarGeo, capGeo, haloGeo, pulseSphereGeo);

    NODE_DEFINITIONS.forEach((meta, idx) => {
      const gx = Math.cos(meta.angle) * orbitRadius;
      const gz = Math.sin(meta.angle) * orbitRadius;

      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(gx, 0, gz);

      const nodeShadow = new THREE.Mesh(contactPlaneGeo, contactMat);
      nodeShadow.rotation.x = -Math.PI / 2;
      nodeShadow.position.y = 0.015;
      nodeGroup.add(nodeShadow);

      const plinth = new THREE.Mesh(plinthGeo, darkMetalMat);
      plinth.position.y = 0.12;
      plinth.castShadow = !isSoftwareGl;
      plinth.receiveShadow = !isSoftwareGl;
      nodeGroup.add(plinth);

      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.35,
        metalness: 0.78,
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.y = 0.66;
      pillar.castShadow = !isSoftwareGl;
      nodeGroup.add(pillar);

      const capMat = new THREE.MeshPhysicalMaterial({
        color: meta.color,
        emissive: meta.color,
        emissiveIntensity: 0.22,
        roughness: 0.18,
        metalness: 0.25,
        clearcoat: 0.9,
      });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 1.48;
      cap.castShadow = !isSoftwareGl;
      nodeGroup.add(cap);

      const haloMat = new THREE.MeshStandardMaterial({
        color: meta.color,
        emissive: meta.color,
        emissiveIntensity: 0.5,
        roughness: 0.25,
        metalness: 0.7,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 1.08;
      nodeGroup.add(halo);

      const hitGeo = new THREE.CylinderGeometry(0.92, 0.92, 1.95, 10);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.y = 0.95;
      hitMesh.userData.nodeMeta = meta;
      nodeGroup.add(hitMesh);
      clickableTargets.push(hitMesh);

      scene.add(nodeGroup);

      const startPt = new THREE.Vector3(Math.cos(meta.angle) * 1.15, 0.78, Math.sin(meta.angle) * 1.15);
      const midPt = new THREE.Vector3(Math.cos(meta.angle) * 2.85, 1.38, Math.sin(meta.angle) * 2.85);
      const endPt = new THREE.Vector3(
        Math.cos(meta.angle) * (orbitRadius - 0.55),
        0.78,
        Math.sin(meta.angle) * (orbitRadius - 0.55)
      );
      const curve = new THREE.CatmullRomCurve3([startPt, midPt, endPt]);
      const tubeGeo = new THREE.TubeGeometry(curve, isSoftwareGl ? 16 : 28, 0.045, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        emissive: meta.color,
        emissiveIntensity: 0.25,
        roughness: 0.3,
        metalness: 0.8,
      });
      scene.add(new THREE.Mesh(tubeGeo, tubeMat));

      const pulseMat = new THREE.MeshBasicMaterial({ color: meta.color });
      const pulseMesh = new THREE.Mesh(pulseSphereGeo, pulseMat);
      scene.add(pulseMesh);

      disposables.push(pillarMat, capMat, haloMat, hitGeo, hitMat, tubeGeo, tubeMat, pulseMat);
      nodeRecords.push({
        meta,
        group: nodeGroup,
        cap,
        haloMat,
        curve,
        pulseMesh,
        phaseOffset: idx * 0.2,
      });
    });

    // Expanding Ripple Ring
    const waveRingGeo = new THREE.RingGeometry(0.95, 1.12, isSoftwareGl ? 28 : 48);
    const waveRingMat = new THREE.MeshBasicMaterial({
      color: 0x2dd4bf,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const waveRing = new THREE.Mesh(waveRingGeo, waveRingMat);
    waveRing.rotation.x = -Math.PI / 2;
    waveRing.position.y = 0.04;
    scene.add(waveRing);
    disposables.push(waveRingGeo, waveRingMat);

    let waveProgress = 1;
    triggerWaveFnRef.current = () => {
      waveProgress = 0;
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Raycasting
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const updatePointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    let lastHoverTs = 0;
    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverTs < 40) return;
      lastHoverTs = now;
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableTargets, false);
      if (hits.length > 0) {
        const meta = hits[0].object.userData.nodeMeta as PolicyNodeMeta | undefined;
        setHoveredName(meta?.label || null);
        canvas.style.cursor = 'pointer';
      } else {
        setHoveredName(null);
        canvas.style.cursor = 'grab';
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6) return;
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableTargets, false);
      if (hits.length > 0) {
        const meta = hits[0].object.userData.nodeMeta as PolicyNodeMeta | undefined;
        if (meta) {
          setSelectedNode(meta);
          focusNodeFnRef.current?.(meta);
        }
      }
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    let resizeRafId = 0;
    let lastResizeW = 0;
    let lastResizeH = 0;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || disposed) return;
      const w = Math.round(Math.max(entry.contentRect.width, 280));
      const h = Math.round(Math.max(entry.contentRect.height, 280));
      if (w === lastResizeW && h === lastResizeH) return;
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(() => {
        if (disposed) return;
        lastResizeW = w;
        lastResizeH = h;
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

      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      const { approvedAmendmentsCount: approved, appliedImpactsCount: applied } =
        activeStateRef.current;
      const hasActivity = approved > 0 || applied > 0;

      crystalMesh.rotation.y += delta * (hasActivity ? 0.9 : 0.38);
      crystalMesh.position.y = 1.68 + Math.sin(elapsed * 2.0) * 0.06;
      gyroRing.rotation.x = Math.sin(elapsed * 0.7) * 0.45;
      gyroRing.rotation.z += delta * 0.45;
      satellitesGroup.rotation.y -= delta * 0.65;

      if (autoOrbitRef.current && !transitionActive) {
        scene.rotation.y += delta * 0.1;
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

      if (waveProgress < 1) {
        waveProgress = Math.min(1, waveProgress + delta * 0.9);
        const s = 1 + waveProgress * 5.2;
        waveRing.scale.set(s, s, 1);
        waveRingMat.opacity = (1 - waveProgress) * 0.65;
      } else {
        waveRingMat.opacity = 0;
      }

      for (let i = 0; i < nodeRecords.length; i++) {
        const rec = nodeRecords[i];
        rec.cap.rotation.y += delta * 0.6;
        rec.cap.position.y = 1.48 + Math.sin(elapsed * 2.2 + i) * 0.05;
        const speed = hasActivity ? 0.55 : 0.22;
        const t = (elapsed * speed + rec.phaseOffset) % 1;
        rec.curve.getPointAt(t, _tmpVec3);
        rec.pulseMesh.position.copy(_tmpVec3);
        rec.haloMat.emissiveIntensity = THREE.MathUtils.damp(
          rec.haloMat.emissiveIntensity,
          hasActivity ? 0.85 : 0.3,
          6,
          delta
        );
      }

      controls.update();
      renderer.render(scene, camera);
    };

    const scheduleNext = () => {
      if (disposed) return;
      if (
        isSoftwareGl &&
        typeof (renderer as unknown as { afterDraw?: (cb: () => void) => void }).afterDraw ===
          'function'
      ) {
        (renderer as unknown as { afterDraw: (cb: () => void) => void }).afterDraw(() => {
          animationId = requestAnimationFrame(tick);
        });
      } else {
        animationId = requestAnimationFrame(tick);
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
      cancelAnimationFrame(animationId);
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.dispose();
      disposables.forEach((dObj) => dObj.dispose());
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-[380px] sm:h-[420px] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 select-none">
      <div ref={mountRef} className="w-full h-full" />

      {webglUnavailable && (
        <div className="absolute inset-0 z-20 flex flex-col justify-center gap-4 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950/40 p-6">
          <div className="text-xs font-mono text-cyan-300 uppercase tracking-wider">
            Policy Ripple Dependency Map · Active amendments: {approvedAmendmentsCount} · Applied ripples:{' '}
            {appliedImpactsCount}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            {NODE_DEFINITIONS.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedNode(node)}
                className={`text-left rounded-lg border p-3 cursor-pointer transition-colors ${
                  selectedNode?.id === node.id
                    ? 'border-cyan-400 bg-cyan-950/60 text-white'
                    : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-cyan-500/60'
                }`}
              >
                <div className="text-xs font-bold text-cyan-300">{node.label}</div>
                <div className="text-[11px] text-slate-400 mt-1">{node.role}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {contextLost && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/90 text-slate-200 text-sm p-6 text-center">
          3D viewport paused while restoring graphics context. Reload or switch tabs if needed.
        </div>
      )}

      {/* Semantic HUD Telemetry Overlay (no backdrop-filter over WebGL) */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none flex flex-col gap-1.5 max-w-[260px]">
        <div className="rounded-md bg-slate-950/88 border border-slate-700/80 px-3 py-2 text-xs text-slate-200 shadow-sm">
          <div className="font-semibold text-cyan-300">
            3D Policy Dependency Core
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
            Active amendments: {approvedAmendmentsCount} · Applied ripples: {appliedImpactsCount}
          </div>
          {hoveredName && (
            <div className="text-[11px] text-amber-300 mt-1">Hovering: {hoveredName}</div>
          )}
        </div>

        {selectedNode && (
          <div className="rounded-md bg-slate-950/92 border border-cyan-500/50 px-3 py-2 text-xs text-slate-100 pointer-events-auto">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{selectedNode.label}</span>
              <button
                type="button"
                onClick={() => resetCameraFnRef.current?.()}
                className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
              >
                Clear
              </button>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">{selectedNode.role}</div>
          </div>
        )}
      </div>

      {/* Compact Collapsible Bottom Control Dock (<= 15% height) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
        {dockCollapsed ? (
          <button
            type="button"
            onClick={() => setDockCollapsed(false)}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-950/90 border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-400 cursor-pointer"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span>3D Controls</span>
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-slate-950/90 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 shadow-lg">
            <button
              type="button"
              onClick={() => resetCameraFnRef.current?.()}
              className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              title="Reset 3D camera"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-300" />
              <span>Reset View</span>
            </button>
            <button
              type="button"
              onClick={() => setAutoOrbit((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded cursor-pointer whitespace-nowrap ${
                autoOrbit ? 'bg-cyan-500/20 text-cyan-200' : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <Orbit className="w-3.5 h-3.5" />
              <span>{autoOrbit ? 'Orbit On' : 'Orbit Off'}</span>
            </button>
            <button
              type="button"
              onClick={() => setLocalPulse((n) => n + 1)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-teal-700/80 hover:bg-teal-600 text-white cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pulse Wave</span>
            </button>
            <button
              type="button"
              onClick={() => setDockCollapsed(true)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              aria-label="Collapse 3D control dock"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
