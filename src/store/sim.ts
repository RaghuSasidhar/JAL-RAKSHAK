import { create } from "zustand";
import { createEngine, setScenario, step, type EngineState } from "@/simulator/engine";
import { INDICATORS, type Indicator, type Reading, type ScenarioId } from "@/simulator/types";
import { applyHysteresis, evaluate, LABEL, type Status, worst } from "@/detection";

export type AlertState = "New" | "Acknowledged" | "Action recorded" | "Lab result recorded" | "Closed";
export interface Alert {
  id: string;
  indicator: Indicator;
  type: "water" | "device";
  severity: Status;
  text: string;
  state: AlertState;
  recovered: boolean;
  timeline: { ts: string; actor: string; note: string }[];
}
export interface Notice {
  id: number;
  text: string;
  delivery: "sending" | "sent" | "retrying";
}

type Evals = Record<Indicator, { status: Status; reason: string }>;
const blankEvals = (): Evals =>
  Object.fromEntries(INDICATORS.map((i) => [i, { status: "learning", reason: "" }])) as Evals;

interface SimStore {
  engine: EngineState | null;
  running: boolean;
  speed: 1 | 10 | 60;
  history: (Reading | null)[]; // null = gap
  latest: Reading | null;
  buffer: Reading[];
  networkCutUntil: number | null;
  missed: number;
  evals: Evals;
  raised: Record<Indicator, { raised: boolean; streak: number }>;
  overall: Status;
  packetBurst: number; // increments by count of packets sent
  sendLed: "sent" | "buffering" | "offline";
  alerts: Alert[];
  notice: Notice | null;
  view: "twin" | "schematic";
  selected: Indicator | null;
  init: () => void;
  tick: () => void;
  scenario: (id: ScenarioId) => void;
  setSpeed: (s: 1 | 10 | 60) => void;
  setView: (v: "twin" | "schematic") => void;
  select: (i: Indicator | null) => void;
  alertAction: (id: string, state: AlertState, note: string) => void;
}

const initRaised = () =>
  Object.fromEntries(INDICATORS.map((i) => [i, { raised: false, streak: 0 }])) as SimStore["raised"];

export const useSim = create<SimStore>((set, get) => ({
  engine: null,
  running: true,
  speed: 10,
  history: [],
  latest: null,
  buffer: [],
  networkCutUntil: null,
  missed: 0,
  evals: blankEvals(),
  raised: initRaised(),
  overall: "learning",
  packetBurst: 0,
  sendLed: "sent",
  alerts: [],
  notice: null,
  view: "twin",
  selected: null,

  init: () => {
    if (get().engine) return;
    // Pre-warm a baseline so anomaly detection is active on first view.
    let e = createEngine(Date.now() - 50 * 5000);
    const hist: Reading[] = [];
    for (let i = 0; i < 50; i++) {
      const r = step(e);
      e = r.state;
      if (r.reading) hist.push(r.reading);
    }
    set({ engine: e, history: hist, latest: hist[hist.length - 1] });
    get().tick();
  },

  tick: () => {
    const s = get();
    if (!s.engine) return;
    const { state, reading } = step(s.engine);
    const patch: Partial<SimStore> = { engine: state };

    if (!reading) {
      const missed = s.missed + 1;
      patch.missed = missed;
      patch.sendLed = "offline";
      if (missed >= 3) {
        patch.overall = "nodata";
        if (missed === 3) patch.history = [...s.history, null].slice(-300);
      }
      set(patch);
      return;
    }
    patch.missed = 0;

    // Network cut: buffer until the cut window ends, then burst in order.
    let delivered: Reading[] = [reading];
    if (s.networkCutUntil && state.simMs < s.networkCutUntil) {
      patch.buffer = [...s.buffer, reading];
      patch.sendLed = "buffering";
      delivered = [];
    } else if (s.buffer.length) {
      delivered = [...s.buffer, reading];
      patch.buffer = [];
      patch.networkCutUntil = null;
    }
    if (!delivered.length) {
      set(patch);
      return;
    }
    patch.sendLed = "sent";
    patch.packetBurst = s.packetBurst + delivered.length;

    let history = s.history;
    let evals = s.evals;
    const raised = { ...s.raised };
    const alerts = [...s.alerts];
    let notice: Notice | null = null;
    for (const r of delivered) {
      const valid = history.filter((h): h is Reading => h !== null);
      evals = Object.fromEntries(INDICATORS.map((i) => [i, evaluate(i, r, valid)])) as Evals;
      for (const i of INDICATORS) {
        const ev = evals[i];
        const isFlag = ev.status === "concern" || ev.status === "strong" || ev.status === "device";
        const h = applyHysteresis(raised[i].raised, raised[i].streak, !isFlag);
        const wasRaised = raised[i].raised;
        raised[i] = h;
        const type = ev.status === "device" ? "device" : "water";
        const open = alerts.find((a) => a.indicator === i && a.type === type && a.state !== "Closed");
        if (isFlag && !open) {
          const text =
            type === "device"
              ? `Check device: ${LABEL[i]} sensor — ${ev.reason.toLowerCase()}`
              : `${ev.status === "strong" ? "Strong" : "Potential"} concern at Village overhead tank: ${ev.reason.toLowerCase()} (${r[i]})`;
          alerts.unshift({
            id: `A-${r.seq}-${i}`,
            indicator: i,
            type,
            severity: ev.status,
            text,
            state: "New",
            recovered: false,
            timeline: [{ ts: r.ts, actor: "System", note: "Alert raised" }],
          });
          notice = { id: r.seq, text, delivery: "sending" };
        } else if (open && wasRaised && !h.raised && !open.recovered) {
          open.recovered = true;
          open.timeline.push({ ts: r.ts, actor: "System", note: "Readings back to normal" });
        }
        // Keep shown status latched while hysteresis holds.
        if (!isFlag && h.raised && open) evals[i] = { status: open.severity, reason: "Recovering…" };
      }
      history = [...history, r].slice(-300);
    }
    patch.history = history;
    patch.latest = delivered[delivered.length - 1];
    patch.evals = evals;
    patch.raised = raised;
    patch.alerts = alerts;
    patch.overall = worst(INDICATORS.map((i) => evals[i].status));
    if (notice) {
      patch.notice = notice;
      const id = notice.id;
      const fail = Math.random() < 0.3;
      setTimeout(() => {
        const n = get().notice;
        if (n?.id === id) set({ notice: { ...n, delivery: fail ? "retrying" : "sent" } });
      }, 900);
      if (fail)
        setTimeout(() => {
          const n = get().notice;
          if (n?.id === id) set({ notice: { ...n, delivery: "sent" } });
        }, 2600);
      setTimeout(() => get().notice?.id === id && set({ notice: null }), 6000);
    }
    set(patch);
  },

  scenario: (id) => {
    const s = get();
    if (!s.engine) return;
    const engine = setScenario(s.engine, id === "S7" ? "normal" : id);
    set({
      engine,
      networkCutUntil: id === "S7" ? engine.simMs + 30 * 60 * 1000 : null,
      ...(id === "normal" ? { raised: initRaised() } : {}),
    });
  },
  setSpeed: (speed) => set({ speed }),
  setView: (view) => set({ view }),
  select: (selected) => set({ selected }),
  alertAction: (id, state, note) =>
    set({
      alerts: get().alerts.map((a) =>
        a.id === id
          ? { ...a, state, timeline: [...a.timeline, { ts: new Date().toISOString(), actor: "Operator", note }] }
          : a,
      ),
    }),
}));
