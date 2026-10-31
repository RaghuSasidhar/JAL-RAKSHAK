export type Indicator = "ph" | "turbidity_ntu" | "tds_mgl" | "temp_c";
export const INDICATORS: Indicator[] = ["ph", "turbidity_ntu", "tds_mgl", "temp_c"];

export interface Reading {
  source_id: string;
  ts: string;
  seq: number;
  ph: number | null;
  turbidity_ntu: number | null;
  tds_mgl: number | null;
  temp_c: number | null;
  rssi: number;
  fw: string;
  cal: string;
  faults: string[];
}

export interface Batch {
  readings: Reading[];
}

export type ScenarioId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "normal";

export const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: "S1", label: "Contaminate tank" },
  { id: "S2", label: "Drift pH" },
  { id: "S3", label: "TDS jump" },
  { id: "S4", label: "Stick sensor" },
  { id: "S5", label: "Unplug device" },
  { id: "S6", label: "Clean day" },
  { id: "S7", label: "Network cut" },
];
