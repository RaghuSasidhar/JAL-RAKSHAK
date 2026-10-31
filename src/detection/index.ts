import type { Indicator, Reading } from "@/simulator/types";

export type Status = "normal" | "concern" | "strong" | "device" | "nodata" | "learning";

export const STATUS_META: Record<Status, { word: string; todo: string }> = {
  normal: { word: "Readings normal", todo: "No action needed." },
  concern: { word: "Potential concern", todo: "Inspect the source and consider a lab sample." },
  strong: { word: "Strong concern", todo: "Advise boiling or an alternate source; send a sample to the lab." },
  device: { word: "Check device", todo: "Inspect the sensor unit and cables." },
  nodata: { word: "No data", todo: "Check power and Wi-Fi at the unit." },
  learning: { word: "Learning normal range", todo: "Collecting baseline readings." },
};

/** Higher wins when several statuses apply. */
const PRIORITY: Status[] = ["nodata", "device", "strong", "concern", "learning", "normal"];
export function worst(list: Status[]): Status {
  for (const p of PRIORITY) if (list.includes(p)) return p;
  return "normal";
}

export const RANGES: Record<Indicator, [number, number]> = {
  ph: [0, 14],
  turbidity_ntu: [0, 3000],
  tds_mgl: [0, 5000],
  temp_c: [-5, 60],
};

export function isValid(ind: Indicator, v: number | null): v is number {
  return v !== null && Number.isFinite(v) && v >= RANGES[ind][0] && v <= RANGES[ind][1];
}

/** Placeholder thresholds — expert to confirm. */
export const THRESHOLDS = {
  ph: { min: 6.5, max: 8.5 },
  turbidity_ntu: { concern: 1, strong: 5 },
  tds_mgl: { concern: 500, strong: 2000 },
};

export function thresholdStatus(ind: Indicator, v: number): Status {
  if (ind === "ph") return v < THRESHOLDS.ph.min || v > THRESHOLDS.ph.max ? "concern" : "normal";
  if (ind === "turbidity_ntu") {
    if (v > THRESHOLDS.turbidity_ntu.strong) return "strong";
    return v > THRESHOLDS.turbidity_ntu.concern ? "concern" : "normal";
  }
  if (ind === "tds_mgl") {
    if (v > THRESHOLDS.tds_mgl.strong) return "strong";
    return v > THRESHOLDS.tds_mgl.concern ? "concern" : "normal";
  }
  return "normal";
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const ANOMALY = { window: 60, minN: 48, z: 4, madFloor: { ph: 0.02, turbidity_ntu: 0.05, tds_mgl: 2, temp_c: 0.1 } };

/** Robust z-score; null while still learning. */
export function robustZ(ind: Indicator, x: number, history: number[]): number | null {
  const h = history.slice(-ANOMALY.window);
  if (h.length < ANOMALY.minN) return null;
  const med = median(h);
  const mad = Math.max(median(h.map((v) => Math.abs(v - med))), ANOMALY.madFloor[ind]);
  return (0.6745 * (x - med)) / mad;
}

export function isFlatLine(values: (number | null)[], n = 10): boolean {
  if (values.length < n) return false;
  const last = values.slice(-n);
  return last.every((v) => v !== null && v === last[0]);
}

/** Hysteresis: a raised flag clears only after `need` consecutive normal readings. */
export function applyHysteresis(prevRaised: boolean, normalStreak: number, isNormalNow: boolean, need = 3) {
  const streak = isNormalNow ? normalStreak + 1 : 0;
  if (!isNormalNow) return { raised: true, streak };
  if (prevRaised && streak < need) return { raised: true, streak };
  return { raised: false, streak };
}

export interface IndicatorEval {
  status: Status;
  reason: string;
}

/** Evaluate one indicator of the latest reading against history (valid values only). */
export function evaluate(ind: Indicator, latest: Reading, history: Reading[]): IndicatorEval {
  const v = latest[ind];
  const series = history.map((r) => r[ind]);
  if (!isValid(ind, v)) return { status: "device", reason: "Sensor not readable" };
  if (isFlatLine([...series, v])) return { status: "device", reason: "Sensor repeating the same value" };
  const t = thresholdStatus(ind, v);
  if (t !== "normal") return { status: t, reason: `${LABEL[ind]} outside the usual limit` };
  const valid = series.filter((x): x is number => isValid(ind, x));
  const z = robustZ(ind, v, valid);
  if (z === null) return { status: "learning", reason: "Learning normal range" };
  if (Math.abs(z) > ANOMALY.z) return { status: "concern", reason: `${LABEL[ind]} higher than usual` };
  return { status: "normal", reason: "" };
}

export const LABEL: Record<Indicator, string> = {
  ph: "pH",
  turbidity_ntu: "Turbidity",
  tds_mgl: "TDS",
  temp_c: "Temperature",
};
export const UNIT: Record<Indicator, string> = { ph: "", turbidity_ntu: "NTU", tds_mgl: "mg/L", temp_c: "°C" };
