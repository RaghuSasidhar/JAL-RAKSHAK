import type { Reading, ScenarioId } from "./types";

/** Pure-ish reading generator. A real backend replaces this module. */
export interface EngineState {
  seq: number;
  simMs: number; // simulated epoch ms
  scenario: ScenarioId;
  scenarioStartMs: number;
  stuckPh: number | null;
}

export const INTERVAL_S = 5;
const noise = (amp: number) => (Math.random() * 2 - 1) * amp;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function createEngine(nowMs: number): EngineState {
  return { seq: 1000, simMs: nowMs, scenario: "normal", scenarioStartMs: nowMs, stuckPh: null };
}

export function setScenario(s: EngineState, id: ScenarioId): EngineState {
  return { ...s, scenario: id, scenarioStartMs: s.simMs, stuckPh: null };
}

/** Advance one interval. Returns null reading when the device is unplugged. */
export function step(s: EngineState): { state: EngineState; reading: Reading | null } {
  const simMs = s.simMs + INTERVAL_S * 1000;
  const el = (simMs - s.scenarioStartMs) / 1000; // seconds since scenario start
  const hour = new Date(simMs).getUTCHours() + new Date(simMs).getUTCMinutes() / 60;
  const next: EngineState = { ...s, simMs };

  if (s.scenario === "S5") return { state: next, reading: null };

  let ph = 7.4 + noise(0.05);
  let turb = Math.max(0.05, 0.6 + noise(0.15));
  let tds = 310 + noise(8);
  const temp = 29 + 2 * Math.sin(((hour - 9) / 24) * Math.PI * 2) + noise(0.2);

  if (s.scenario === "S1") turb = Math.min(6, 0.6 + (5.4 * el) / 20) + noise(0.15);
  if (s.scenario === "S2") ph = Math.max(5.9, 7.4 - el * 0.004) + noise(0.03);
  if (s.scenario === "S3") tds = 780 + noise(12);
  if (s.scenario === "S4") {
    next.stuckPh = s.stuckPh ?? r2(ph);
    ph = next.stuckPh;
  }

  next.seq = s.seq + 1;
  const reading: Reading = {
    source_id: "SRC-001",
    ts: new Date(simMs).toISOString(),
    seq: next.seq,
    ph: r2(ph),
    turbidity_ntu: r2(turb),
    tds_mgl: Math.round(tds),
    temp_c: r2(temp),
    rssi: Math.round(-61 + noise(4)),
    fw: "0.1.0",
    cal: "2026-10-12",
    faults: [],
  };
  return { state: next, reading };
}
