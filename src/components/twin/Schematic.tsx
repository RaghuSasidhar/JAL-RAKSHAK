import { useSim } from "@/store/sim";
import { LABEL, UNIT } from "@/detection";
import { INDICATORS } from "@/simulator/types";

/** SCADA-style 2D view sharing the same live state. */
export default function Schematic() {
  const latest = useSim((s) => s.latest);
  const evals = useSim((s) => s.evals);
  const history = useSim((s) => s.history);
  const turb = history.slice(-60).map((r) => r?.turbidity_ntu ?? null);
  const max = Math.max(2, ...turb.map((v) => v ?? 0));
  let d = "";
  let pen = false;
  turb.forEach((v, i) => {
    if (v === null) return void (pen = false);
    d += `${pen ? "L" : "M"}${40 + i * 6},${430 - (v / max) * 90} `;
    pen = true;
  });
  return (
    <svg viewBox="0 0 800 480" className="h-full w-full" role="img" aria-label="Schematic view">
      <g className="stroke-muted-foreground" fill="none" strokeWidth={6} strokeLinecap="round">
        <path d="M150 170 V250 H330" />
        <path d="M400 310 V360 H560" className="stroke-muted" />
      </g>
      <path d="M440 210 H600 V150 H680" className="stroke-glow" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
      <rect x="90" y="60" width="120" height="110" rx="10" className="fill-card stroke-border" />
      <rect x="96" y="90" width="108" height="74" rx="6" className="fill-st-learning opacity-60" />
      <text x="150" y="50" textAnchor="middle" className="fill-muted-foreground text-[11px] uppercase tracking-widest">Overhead tank</text>
      <rect x="330" y="200" width="110" height="110" rx="10" className="fill-card stroke-border" />
      <text x="385" y="190" textAnchor="middle" className="fill-muted-foreground text-[11px] uppercase tracking-widest">Flow cell</text>
      {INDICATORS.map((ind, i) => (
        <g key={ind} transform={`translate(${520 + (i % 2) * 130}, ${250 + Math.floor(i / 2) * 90})`}>
          <circle r="34" className={`fill-card st-ring-${evals[ind].status}`} strokeWidth={3} stroke={`var(--st-${evals[ind].status})`} />
          <text textAnchor="middle" y="-4" className="fill-foreground font-num text-[13px]">{latest?.[ind] ?? "—"}</text>
          <text textAnchor="middle" y="12" className="fill-muted-foreground text-[9px] uppercase">{LABEL[ind]} {UNIT[ind]}</text>
        </g>
      ))}
      <circle cx="680" cy="150" r="20" className="fill-card stroke-glow" />
      <text x="680" y="120" textAnchor="middle" className="fill-muted-foreground text-[11px] uppercase tracking-widest">Cloud</text>
      <g>
        <rect x="30" y="330" width="400" height="110" rx="8" className="fill-card stroke-border" />
        <text x="44" y="350" className="fill-muted-foreground text-[10px] uppercase tracking-widest">Turbidity trend (gaps shown)</text>
        <line x1="40" x2="420" y1={430 - (1 / max) * 90} y2={430 - (1 / max) * 90} stroke="var(--st-concern)" strokeDasharray="3 3" />
        <path d={d} fill="none" stroke="var(--glow)" strokeWidth={1.8} />
      </g>
    </svg>
  );
}
