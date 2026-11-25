import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

interface AuthHero3DSceneProps {
  activeRoleHighlight?: 'STUDENT' | 'ORGANIZATION' | 'ADMIN';
}

function createDialTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cx = 256;
  const cy = 256;

  ctx.fillStyle = '#0b1324';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle radial civic rings
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.lineWidth = 2;
  [90, 148, 206, 238].forEach((r) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Fine radial ticks
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.32)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const inner = i % 4 === 0 ? 188 : 198;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * 212, cy + Math.sin(a) * 212);
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
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.72)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.25)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export const AuthHero3DScene: React.FC<AuthHero3DSceneProps> = ({
  activeRoleHighlight = 'STUDENT',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const roleRef = useRef(activeRoleHighlight);
  const [fallbackActive, setFallbackActive] = useState(false);

  useEffect(() => {
    roleRef.current = activeRoleHighlight;
  }, [activeRoleHighlight]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 360);

    let isSoftwareGl = false;
    try {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) {
        setFallbackActive(true);
        return;
      }
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        const rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
        isSoftwareGl = /SwiftShader|llvmpipe|Software/i.test(rendererStr);
      }
    } catch {
      setFallbackActive(true);
      return;
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    const dpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setFallbackActive(true);
    };
    const handleContextRestored = () => {
      setFallbackActive(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x09111e, 0.045);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
    camera.position.set(0, 0.55, 7.8);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.75;

    // Warm key + cool hemisphere lighting
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.8);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x22d3ee, 3.2, 18);
    rimLight.position.set(-4.5, -2, 3.5);
    scene.add(rimLight);

    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const dialTex = createDialTexture(maxAniso);
    const shadowTex = createContactShadowTexture();

    const sculpture = new THREE.Group();
    scene.add(sculpture);

    const disposables: Array<{ dispose: () => void }> = [dialTex, shadowTex];

    // Calibrated Civic Ground Plinth + Soft Contact Shadow (anchors the sculpture)
    const groundShadowGeo = new THREE.PlaneGeometry(4.2, 4.2);
    const groundShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const groundShadow = new THREE.Mesh(groundShadowGeo, groundShadowMat);
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.position.y = -2.28;
    sculpture.add(groundShadow);

    const plinthGeo = new THREE.CylinderGeometry(1.75, 2.0, 0.24, isSoftwareGl ? 24 : 48);
    const plinthMat = new THREE.MeshStandardMaterial({
      map: dialTex,
      roughness: 0.55,
      metalness: 0.45,
    });
    const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
    plinthMesh.position.y = -2.42;
    sculpture.add(plinthMesh);
    disposables.push(groundShadowGeo, groundShadowMat, plinthGeo, plinthMat);

    // 1. Inner Crystalline Civic Core
    const coreGeo = new THREE.OctahedronGeometry(0.92, 0);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0x0d9488,
      emissive: 0x0f766e,
      emissiveIntensity: 0.42,
      metalness: 0.15,
      roughness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    sculpture.add(coreMesh);
    disposables.push(coreGeo, coreMat);

    // Wireframe outer lattice around core
    const cageGeo = new THREE.IcosahedronGeometry(1.36, 1);
    const cageWire = new THREE.WireframeGeometry(cageGeo);
    const cageMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
    });
    const cageLines = new THREE.LineSegments(cageWire, cageMat);
    sculpture.add(cageLines);
    disposables.push(cageGeo, cageWire, cageMat);

    // 2. Anodized Brass Policy Ring + Instanced Tick Markers
    const outerRingGroup = new THREE.Group();
    outerRingGroup.rotation.set(Math.PI * 0.28, -Math.PI * 0.14, 0);
    sculpture.add(outerRingGroup);

    const brassRingGeo = new THREE.TorusGeometry(2.32, 0.042, 14, isSoftwareGl ? 40 : 88);
    const brassRingMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.88,
      roughness: 0.22,
    });
    outerRingGroup.add(new THREE.Mesh(brassRingGeo, brassRingMat));
    disposables.push(brassRingGeo, brassRingMat);

    const tickGeo = new THREE.BoxGeometry(0.045, 0.14, 0.045);
    const tickMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.75,
      roughness: 0.28,
    });
    const tickCount = 24;
    const ticksInstanced = new THREE.InstancedMesh(tickGeo, tickMat, tickCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < tickCount; i++) {
      const a = (i / tickCount) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 2.32, Math.sin(a) * 2.32, 0);
      dummy.rotation.set(0, 0, a + Math.PI / 2);
      dummy.updateMatrix();
      ticksInstanced.setMatrixAt(i, dummy.matrix);
    }
    ticksInstanced.instanceMatrix.needsUpdate = true;
    outerRingGroup.add(ticksInstanced);
    disposables.push(tickGeo, tickMat);

    // 3. Secondary Tilted Cyan Glass Ring
    const innerRingGroup = new THREE.Group();
    innerRingGroup.rotation.set(-Math.PI * 0.24, Math.PI * 0.22, 0.4);
    sculpture.add(innerRingGroup);

    const glassRingGeo = new THREE.TorusGeometry(1.82, 0.032, 14, isSoftwareGl ? 36 : 80);
    const glassRingMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
      metalness: 0.2,
      roughness: 0.12,
      clearcoat: 1,
    });
    innerRingGroup.add(new THREE.Mesh(glassRingGeo, glassRingMat));
    disposables.push(glassRingGeo, glassRingMat);

    // 4. 8 Orbiting Scheme Nodes
    const satGeo = new THREE.SphereGeometry(0.115, 16, 16);
    const satMat = new THREE.MeshPhysicalMaterial({
      color: 0x22d3ee,
      emissive: 0x0891b2,
      emissiveIntensity: 0.7,
      metalness: 0.25,
      roughness: 0.2,
    });
    disposables.push(satGeo, satMat);

    const satellites: Array<{ mesh: THREE.Mesh; baseAngle: number; radius: number; yAmp: number }> = [];
    const satCount = 8;
    for (let i = 0; i < satCount; i++) {
      const mesh = new THREE.Mesh(satGeo, satMat);
      const baseAngle = (i / satCount) * Math.PI * 2;
      const radius = 2.02 + (i % 2) * 0.4;
      mesh.position.set(
        Math.cos(baseAngle) * radius,
        Math.sin(i * 1.1) * 0.52,
        Math.sin(baseAngle) * radius
      );
      sculpture.add(mesh);
      satellites.push({ mesh, baseAngle, radius, yAmp: 0.42 + (i % 3) * 0.14 });
    }

    // 5. Ambient Floating Field Nodes (InstancedMesh)
    const particleCount = isSoftwareGl ? 20 : 52;
    const pGeo = new THREE.SphereGeometry(0.032, 8, 8);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.48,
    });
    const pInst = new THREE.InstancedMesh(pGeo, pMat, particleCount);
    const particleSeeds = Array.from({ length: particleCount }, (_, idx) => ({
      x: (((Math.sin(idx * 12.9898) * 43758.5453) % 1) * 7) - 3.5,
      y: (((Math.sin(idx * 78.233) * 19341.123) % 1) * 5) - 2.5,
      z: -1.5 - Math.abs(Math.cos(idx * 4.7)) * 3.5,
      speed: 0.35 + (idx % 5) * 0.12,
    }));
    scene.add(pInst);
    disposables.push(pGeo, pMat);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Interactive pointer parallax
    let targetRotX = 0;
    let targetRotY = 0;
    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      const ny = ((e.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1;
      targetRotY = nx * 0.42;
      targetRotX = ny * 0.28;
    };
    container.addEventListener('pointermove', onPointerMove);

    let disposed = false;
    let resizeRafId = 0;
    let lastResizeW = 0;
    let lastResizeH = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (disposed) return;
      const w = Math.round(Math.max(container.clientWidth, 240));
      const h = Math.round(Math.max(container.clientHeight, 240));
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

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    let frameId = 0;

    // Pre-allocated scratch colors & objects (zero GC per frame)
    const _roleColorStudent = new THREE.Color(0x0d9488);
    const _roleColorOrg = new THREE.Color(0xd97706);
    const _roleColorAdmin = new THREE.Color(0x06b6d4);

    const updateParticles = (t: number) => {
      for (let i = 0; i < particleCount; i++) {
        const s = particleSeeds[i];
        dummy.position.set(s.x, s.y + Math.sin(t * s.speed + i) * 0.24, s.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        pInst.setMatrixAt(i, dummy.matrix);
      }
      pInst.instanceMatrix.needsUpdate = true;
    };

    const stepFrame = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      const role = roleRef.current;
      const targetColor =
        role === 'ADMIN'
          ? _roleColorAdmin
          : role === 'ORGANIZATION'
          ? _roleColorOrg
          : _roleColorStudent;
      coreMat.color.lerp(targetColor, Math.min(1, delta * 4));

      if (!prefersReduced) {
        sculpture.rotation.y = THREE.MathUtils.damp(sculpture.rotation.y, targetRotY, 4.5, delta);
        sculpture.rotation.x = THREE.MathUtils.damp(sculpture.rotation.x, targetRotX, 4.5, delta);

        coreMesh.rotation.y = elapsed * 0.42;
        coreMesh.rotation.x = Math.sin(elapsed * 0.5) * 0.25;
        cageLines.rotation.y = -elapsed * 0.18;
        outerRingGroup.rotation.z = elapsed * 0.12;
        innerRingGroup.rotation.z = -elapsed * 0.16;

        for (let idx = 0; idx < satellites.length; idx++) {
          const sat = satellites[idx];
          const a = sat.baseAngle + elapsed * 0.18;
          sat.mesh.position.set(
            Math.cos(a) * sat.radius,
            Math.sin(elapsed * 0.9 + idx) * sat.yAmp,
            Math.sin(a) * sat.radius
          );
        }

        updateParticles(elapsed);
      } else {
        updateParticles(0);
      }

      renderer.render(scene, camera);
    };

    const scheduleNext = () => {
      if (disposed || prefersReduced) return;
      if (
        isSoftwareGl &&
        typeof (renderer as unknown as { afterDraw?: (cb: () => void) => void }).afterDraw ===
          'function'
      ) {
        (renderer as unknown as { afterDraw: (cb: () => void) => void }).afterDraw(() => {
          frameId = requestAnimationFrame(tick);
        });
      } else {
        frameId = requestAnimationFrame(tick);
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
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      if (frameId) cancelAnimationFrame(frameId);
      container.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      resizeObserver.disconnect();
      envTarget.dispose();
      pmremGenerator.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (fallbackActive) {
    return (
      <div className="w-full h-full min-h-[320px] flex items-center justify-center bg-slate-900 text-slate-300 text-xs">
        Interactive 3D Policy Intelligence Topology
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[320px] select-none cursor-grab active:cursor-grabbing"
      aria-label="Interactive 3D Rules Intelligence Lattice"
    />
  );
};
