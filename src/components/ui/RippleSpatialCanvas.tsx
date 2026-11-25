import React, { useEffect, useRef } from 'react';
import { useApp, type PageId } from '../../context/AppContext';

interface RippleSpatialCanvasProps {
  approvedAmendmentsCount: number;
  appliedImpactsCount: number;
  pulseKey?: number;
}

const SATELLITES: Array<{ label: string; sub: string; page: PageId }> = [
  { label: 'JanSetu AI', sub: 'Citizen Guidance', page: 'jansetu' },
  { label: 'FormSathi AI', sub: 'Readiness Checks', page: 'formsathi' },
  { label: 'Eligibility', sub: 'Scheme Matching', page: 'eligibility' },
  { label: 'Deadlines', sub: 'Compliance Tasks', page: 'deadlines' },
  { label: 'Alerts', sub: 'Impact Notices', page: 'deadlines' },
];

export const RippleSpatialCanvas: React.FC<RippleSpatialCanvasProps> = ({
  approvedAmendmentsCount,
  appliedImpactsCount,
  pulseKey = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { dark, setPage } = useApp();
  const pulseRef = useRef(0);

  useEffect(() => {
    if (pulseKey > 0) {
      pulseRef.current = 1;
    }
  }, [pulseKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frameId = 0;
    let time = 0;

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) {
        if (!prefersReduced) frameId = requestAnimationFrame(render);
        return;
      }
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.5;
      const radius = Math.min(w, h) * 0.34;

      const accent = dark ? '#38bdf8' : '#0f766e';
      const amber = dark ? '#f59e0b' : '#b45309';
      const muted = dark ? '#475569' : '#94a3b8';
      const labelColor = dark ? '#e2e8f0' : '#0f172a';
      const subColor = dark ? '#94a3b8' : '#64748b';
      const nodeBg = dark ? '#0f172a' : '#ffffff';

      time += 0.014;
      pulseRef.current *= 0.96;
      const activeNodes = Math.min(
        SATELLITES.length,
        approvedAmendmentsCount * 2 + (appliedImpactsCount > 0 ? 1 : 0)
      );

      // Expanding ripple waves
      for (let i = 0; i < 3; i++) {
        const phase = ((time * 0.25 * (1 + pulseRef.current * 2)) + i / 3) % 1;
        const r = 24 + phase * (radius * 1.15);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle =
          approvedAmendmentsCount > 0
            ? dark
              ? `rgba(56, 189, 248, ${(1 - phase) * 0.35})`
              : `rgba(15, 118, 110, ${(1 - phase) * 0.28})`
            : dark
            ? `rgba(148, 163, 184, ${(1 - phase) * 0.18})`
            : `rgba(100, 116, 139, ${(1 - phase) * 0.15})`;
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }

      // Compute satellite positions with gentle orbital drift
      const positions = SATELLITES.map((sat, idx) => {
        const baseAngle = -Math.PI / 2 + (idx / SATELLITES.length) * Math.PI * 2;
        const angle = baseAngle + (prefersReduced ? 0 : Math.sin(time * 0.6 + idx) * 0.05);
        return {
          ...sat,
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          lit: idx < activeNodes,
        };
      });

      // Connections
      positions.forEach((pos) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = pos.lit ? accent : muted;
        ctx.globalAlpha = pos.lit ? 0.75 : 0.35;
        ctx.lineWidth = pos.lit ? 2 : 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // Satellite nodes
      positions.forEach((pos) => {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pos.lit ? 11 + pulseRef.current * 4 : 9, 0, Math.PI * 2);
        ctx.fillStyle = nodeBg;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = pos.lit ? accent : muted;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = pos.lit ? accent : muted;
        ctx.fill();

        ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillStyle = labelColor;
        ctx.textAlign = 'center';
        ctx.fillText(pos.label, pos.x, pos.y + 26);

        ctx.font = '400 10.5px "Public Sans", system-ui, sans-serif';
        ctx.fillStyle = subColor;
        ctx.fillText(pos.sub, pos.x, pos.y + 40);
      });

      // Central rule node
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.fillStyle = nodeBg;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = approvedAmendmentsCount > 0 ? accent : amber;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = approvedAmendmentsCount > 0 ? accent : amber;
      ctx.fill();

      ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.fillText('Unified Rule', cx, cy + 40);

      ctx.restore();

      if (!prefersReduced) {
        frameId = requestAnimationFrame(render);
      }
    };

    render();
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [dark, approvedAmendmentsCount, appliedImpactsCount]);

  return (
    <div className="space-y-3">
      <div className="relative h-72 sm:h-80 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="h-full w-full block"
          aria-label="Policy Ripple Map showing a central verified rule connected to JanSetu AI, FormSathi AI, Eligibility Finder, Deadlines, and Alerts"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500 dark:text-slate-400">Inspect downstream node:</span>
        {SATELLITES.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setPage(s.page)}
            className="rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-teal-700 dark:hover:border-cyan-400 transition-colors cursor-pointer"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
};
