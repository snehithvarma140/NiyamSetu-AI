import React, { useMemo, useState } from 'react';
import { Check, Copy, Printer, RefreshCw, ShieldCheck } from 'lucide-react';

interface EmergencyQrPassProps {
  qrToken: string;
  citizenName: string;
  onRegenerate: () => Promise<void>;
  regenerating?: boolean;
}

/**
 * Generates a deterministic 21x21 QR-like finder & verification matrix
 * strictly encoding ONLY the opaque verification token (never raw PII).
 */
function buildDeterministicMatrix(payload: string): boolean[][] {
  const size = 21;
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const placeFinder = (row0: number, col0: number) => {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[row0 + r][col0 + c] = isBorder || isCenter;
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i += 1) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Deterministic hash stream seeded by payload characters
  let seed = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    seed ^= payload.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  const inReserved = (r: number, c: number) => {
    const topLeft = r < 8 && c < 8;
    const topRight = r < 8 && c >= size - 8;
    const bottomLeft = r >= size - 8 && c < 8;
    const timing = r === 6 || c === 6;
    return topLeft || topRight || bottomLeft || timing;
  };

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (inReserved(r, c)) continue;
      seed ^= (r * 31 + c * 17 + 7) & 0xffffffff;
      seed = Math.imul(seed, 1664525) + 1013904223;
      grid[r][c] = ((seed >>> 24) & 1) === 1;
    }
  }

  return grid;
}

export const EmergencyQrPass: React.FC<EmergencyQrPassProps> = ({
  qrToken,
  citizenName,
  onRegenerate,
  regenerating = false,
}) => {
  const [copied, setCopied] = useState(false);

  const safeToken = qrToken || 'QR-EMR-UNASSIGNED';
  const qrPayload = `NIYAMSETU-EMR-TOKEN:${safeToken}`;
  const matrix = useMemo(() => buildDeterministicMatrix(qrPayload), [qrPayload]);

  const handleCopy = () => {
    navigator.clipboard.writeText(qrPayload).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0" aria-hidden="true" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Consent-Gated Emergency QR Pass
          </h3>
        </div>
        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
          Token-Only Payload · Zero Raw Medical PII
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <div className="p-2.5 rounded-md bg-white border border-slate-300 shrink-0">
          <svg
            viewBox="0 0 21 21"
            className="w-28 h-28 text-slate-950"
            role="img"
            aria-label={`Emergency verification QR code for ${citizenName}`}
          >
            <rect width="21" height="21" fill="#ffffff" />
            {matrix.map((row, rIdx) =>
              row.map((filled, cIdx) =>
                filled ? (
                  <rect
                    key={`${rIdx}-${cIdx}`}
                    x={cIdx}
                    y={rIdx}
                    width={1}
                    height={1}
                    fill="#0f172a"
                  />
                ) : null
              )
            )}
          </svg>
        </div>

        <div className="flex-1 space-y-2.5 min-w-0">
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Verification Pass Token ({citizenName})
            </div>
            <div className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5 break-all">
              {qrPayload}
            </div>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Scanning this pass reveals <strong>no raw personal or medical text offline</strong>. Only an
            authenticated Hospital Responder or Government Emergency Officer can redeem this token to
            view critical life-safety data (blood group, allergies, medications, and ICE contact), and
            every lookup writes a permanent audit log entry.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-700 cursor-pointer whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Token Copied' : 'Copy QR Token'}</span>
            </button>

            <button
              type="button"
              disabled={regenerating}
              onClick={() => void onRegenerate()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-700 disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
              <span>{regenerating ? 'Rotating...' : 'Regenerate QR Token'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Emergency Card</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
