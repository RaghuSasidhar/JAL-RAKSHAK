import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Box, ShieldCheck, Droplets, Moon, Network, Send, Sun, X } from "lucide-react";
import Scene from "@/components/twin/Scene";
import Schematic from "@/components/twin/Schematic";
import { StatusChip } from "@/components/twin/StatusChip";
import { useSim, type AlertState } from "@/store/sim";
import { LABEL, STATUS_META, THRESHOLDS, UNIT, type Status } from "@/detection";
import { INDICATORS, SCENARIOS, type Indicator } from "@/simulator/types";
import { useTicker } from "@/hooks/use-ticker";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Jal Rakshak — Village Water Monitor (Simulation)" },
      { name: "description", content: "Digital-twin simulation of a village drinking-water sensor unit with early-warning alerts." },
      { property: "og:title", content: "Jal Rakshak — Village Water Monitor" },
      { property: "og:description", content: "Simulated pH, turbidity, TDS and temperature monitoring with early-warning alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const ago = (ts?: string, simMs?: number) => {
  if (!ts || !simMs) return "—";
  const m = Math.round((simMs - Date.parse(ts)) / 60000);
  return m <= 0 ? "just now" : `${m} min ago`;
};

function Index() {
  useTicker();
  const [light, setLight] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
  }, [light]);
  const view = useSim((s) => s.view);
  const setView = useSim((s) => s.setView);
  const alerts = useSim((s) => s.alerts.filter((a) => a.state !== "Closed").length);

  return (
    <div className="grid-bg min-h-screen bg-background p-3 text-foreground md:p-5">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-foreground text-background">
            <Droplets className="size-5" />
          </span>
          <span className="font-semibold tracking-[0.18em]">JAL RAKSHAK</span>
        </div>
        <nav className="mx-auto flex gap-1 rounded-lg border border-border p-1 text-[11px] uppercase tracking-wider">
          <span className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background">Village overhead tank</span>
          <span className="flex items-center gap-1 px-3 py-1.5 text-muted-foreground">
            Borewell 2 <span className="size-1.5 rounded-full st-bg-normal" />
          </span>
          <span className="flex items-center gap-1 px-3 py-1.5 text-muted-foreground">
            Anganwadi tap <span className="size-1.5 rounded-full st-bg-nodata" />
          </span>
        </nav>
        <span className="rounded-md border border-st-concern/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-st-concern">
          Simulated data
        </span>
        <button onClick={() => setLight(!light)} className="panel grid size-9 place-items-center" aria-label="Toggle theme">
          {light ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </button>
        <span className="panel relative grid size-9 place-items-center">
          <Bell className="size-4" />
          {alerts > 0 && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-destructive text-[9px] text-destructive-foreground">{alerts}</span>}
        </span>
        <Link to="/officials" className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background">
          <ShieldCheck className="size-4" /> Officials dashboard
        </Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-[250px_1fr_280px]">
        <LeftPanel />
        <section className="relative min-h-[460px] lg:min-h-[560px]">
          {view === "twin" ? <Scene /> : <Schematic />}
          <div className="absolute bottom-2 left-2 flex rounded-lg border border-border bg-card p-1 text-[11px] uppercase tracking-wider">
            {(["twin", "schematic"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${view === v ? "bg-foreground text-background" : "text-muted-foreground"}`}>
                {v === "twin" ? <Box className="size-3.5" /> : <Network className="size-3.5" />}
                {v === "twin" ? "Board view" : "Schematic view"}
              </button>
            ))}
          </div>
        </section>
        <RightPanel />
      </div>

      <BottomCards />
      <PacketInspector />
      <footer className="mt-4 text-center text-[11px] text-muted-foreground">
        Simulated data · Early-warning demo, not a water-safety certificate. Limits are placeholders for expert review.
      </footer>
      <Notification />
      <IndicatorDetail />
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="rounded bg-secondary px-2 py-0.5 font-num">{v}</span>
    </div>
  );
}

function LeftPanel() {
  const latest = useSim((s) => s.latest);
  const overall = useSim((s) => s.overall);
  const evals = useSim((s) => s.evals);
  const buffer = useSim((s) => s.buffer.length);
  const simMs = useSim((s) => s.engine?.simMs);
  const faults = INDICATORS.filter((i) => evals[i].status === "device");
  return (
    <aside className="flex flex-col gap-4">
      <div className="panel space-y-2 p-3">
        <div className="label-caps mb-1">Source data</div>
        <Row k="Source" v="SRC-001" />
        <Row k="Type" v="Overhead tank" />
        <Row k="Updated" v={ago(latest?.ts, simMs)} />
      </div>
      <div className="panel space-y-2 p-3">
        <div className="label-caps mb-1">Status</div>
        <StatusChip status={overall} size="lg" />
        <p className="text-xs text-muted-foreground">{STATUS_META[overall].todo}</p>
        <div className="space-y-1.5 pt-2">
          {INDICATORS.map((i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span>{LABEL[i]}</span>
              <StatusChip status={overall === "nodata" ? "nodata" : evals[i].status} />
            </div>
          ))}
        </div>
      </div>
      <div className="panel space-y-2 p-3">
        <div className="label-caps mb-1">Device health</div>
        <Row k="Signal" v={`${latest?.rssi ?? "—"} dBm`} />
        <Row k="Firmware" v={latest?.fw ?? "—"} />
        <Row k="Calibrated" v={latest?.cal ?? "—"} />
        <Row k="Buffered" v={buffer} />
        <Row k="Faults" v={faults.length ? faults.map((f) => LABEL[f]).join(", ") : "None"} />
      </div>
    </aside>
  );
}

const ACTIONS = ["Inspected source", "Sample taken", "Sent to lab", "Cleaned tank", "Other"];

function RightPanel() {
  const { scenario, speed, setSpeed, alerts, alertAction } = useSim();
  const [open, setOpen] = useState<string | null>(null);
  const shown = alerts.slice(0, 5);
  const act = (id: string, st: AlertState, note: string) => alertAction(id, st, note);
  return (
    <aside className="flex flex-col gap-4">
      <div className="panel p-3">
        <div className="label-caps mb-2">Demo panel</div>
        <div className="grid grid-cols-2 gap-1.5">
          {SCENARIOS.map((s) => (
            <button key={s.id} onClick={() => scenario(s.id)} className="rounded-md border border-border bg-secondary px-2 py-1.5 text-left text-[11px] hover:border-glow">
              <span className="font-num text-glow">{s.id}</span> {s.label}
            </button>
          ))}
          <button onClick={() => scenario("normal")} className="rounded-md bg-foreground px-2 py-1.5 text-[11px] font-medium text-background">
            Reset to normal
          </button>
        </div>
        <div className="label-caps mb-1 mt-3">Speed</div>
        <div className="flex gap-1">
          {([1, 10, 60] as const).map((x) => (
            <button key={x} onClick={() => setSpeed(x)} className={`flex-1 rounded-md py-1 font-num text-xs ${speed === x ? "bg-foreground text-background" : "bg-secondary"}`}>
              {x}x
            </button>
          ))}
        </div>
      </div>
      <div className="panel p-3">
        <div className="label-caps mb-2">Alerts</div>
        {shown.length === 0 && <p className="text-xs text-muted-foreground">No alerts yet.</p>}
        <div className="space-y-2">
          {shown.map((a) => (
            <div key={a.id} className={`rounded-md bg-secondary p-2 text-xs st-ring-${a.severity}`}>
              <button className="w-full text-left" onClick={() => setOpen(open === a.id ? null : a.id)}>
                <div className="flex justify-between">
                  <StatusChip status={a.severity} />
                  <span className="text-[10px] text-muted-foreground">{a.state}</span>
                </div>
                <p className="mt-1">{a.text}</p>
                {a.recovered && <p className="mt-1 text-st-normal">Readings back to normal — still open until closed.</p>}
              </button>
              {open === a.id && (
                <div className="mt-2 space-y-2 border-t border-border pt-2">
                  <ol className="space-y-0.5 text-[10px] text-muted-foreground">
                    {a.timeline.map((t, i) => (
                      <li key={i}>
                        <span className="font-num">{t.ts.slice(11, 19)}Z</span> · {t.actor} · {t.note}
                      </li>
                    ))}
                  </ol>
                  {a.state !== "Closed" && (
                    <div className="flex flex-wrap gap-1">
                      {a.state === "New" && <Btn onClick={() => act(a.id, "Acknowledged", "Acknowledged")}>Acknowledge</Btn>}
                      <select
                        className="rounded bg-background px-1 py-0.5 text-[10px]"
                        defaultValue=""
                        onChange={(e) => e.target.value && act(a.id, "Action recorded", e.target.value)}
                      >
                        <option value="">Record action…</option>
                        {ACTIONS.map((x) => <option key={x}>{x}</option>)}
                      </select>
                      <select
                        className="rounded bg-background px-1 py-0.5 text-[10px]"
                        defaultValue=""
                        onChange={(e) => e.target.value && act(a.id, "Lab result recorded", `Lab: ${e.target.value}`)}
                      >
                        <option value="">Lab result…</option>
                        {["Within limits", "Not within limits", "Not yet received"].map((x) => <option key={x}>{x}</option>)}
                      </select>
                      <Btn onClick={() => act(a.id, "Closed", "Closed")}>Close</Btn>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function Btn(p: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={p.onClick} className="rounded bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
      {p.children}
    </button>
  );
}

function Spark({ ind, h = 60 }: { ind: Indicator; h?: number }) {
  const history = useSim((s) => s.history).slice(-80);
  const vals = history.map((r) => r?.[ind] ?? null);
  const nums = vals.filter((v): v is number => v !== null);
  const lo = Math.min(...nums), hi = Math.max(...nums, lo + 0.01);
  let d = "", pen = false;
  vals.forEach((v, i) => {
    if (v === null) return void (pen = false);
    d += `${pen ? "L" : "M"}${(i / 79) * 300},${h - 4 - ((v - lo) / (hi - lo)) * (h - 8)} `;
    pen = true;
  });
  return (
    <svg viewBox={`0 0 300 ${h}`} className="w-full" preserveAspectRatio="none" style={{ height: h }}>
      <path d={d} fill="none" stroke="var(--glow)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function BottomCards() {
  const latest = useSim((s) => s.latest);
  const evals = useSim((s) => s.evals);
  const overall = useSim((s) => s.overall);
  const st = (i: Indicator): Status => (overall === "nodata" ? "nodata" : evals[i].status);
  const ph = latest?.ph ?? 7;
  const dots = 28;
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      <div className="panel p-4">
        <div className="label-caps text-center">pH level</div>
        <div className="relative mx-auto mt-3 grid size-36 place-items-center">
          {Array.from({ length: dots }).map((_, i) => {
            const a = (i / dots) * Math.PI * 2 - Math.PI / 2;
            const on = i / dots <= ph / 14;
            return (
              <span
                key={i}
                className={`absolute size-1.5 rounded-full ${on ? `st-bg-${st("ph")}` : "bg-muted"}`}
                style={{ left: `calc(50% + ${Math.cos(a) * 64}px - 3px)`, top: `calc(50% + ${Math.sin(a) * 64}px - 3px)` }}
              />
            );
          })}
          <div className="grid size-24 place-items-center rounded-full border-2 border-foreground/70 bg-background">
            <div className="text-center">
              <div className="font-num text-3xl">{latest?.ph ?? "—"}</div>
              <div className="text-[10px] text-muted-foreground">limit {THRESHOLDS.ph.min}–{THRESHOLDS.ph.max}</div>
            </div>
          </div>
        </div>
        <div className="mt-3 text-center"><StatusChip status={st("ph")} /></div>
      </div>

      <div className="rounded-[var(--radius)] bg-hero-card p-4 text-hero-card-foreground">
        <div className="label-caps text-center">Turbidity</div>
        <div className="mt-3 flex items-end justify-center gap-2">
          <span className="font-num text-6xl font-medium">{latest?.turbidity_ntu ?? "—"}</span>
          <span className="mb-2 text-sm opacity-60">NTU</span>
        </div>
        <div className="mt-2 text-center"><StatusChip status={st("turbidity_ntu")} /></div>
        <div className="relative mt-4 h-2 rounded-full bg-st-normal/30">
          <div className="absolute inset-y-0 rounded-full st-bg-concern" style={{ left: "16%", width: "68%", opacity: 0.35 }} />
          <div className="absolute inset-y-0 right-0 rounded-r-full st-bg-strong" style={{ width: "16%", opacity: 0.5 }} />
          <div className="absolute -top-1 size-4 rounded-full border-2 border-hero-card bg-hero-card-foreground" style={{ left: `calc(${Math.min(100, ((latest?.turbidity_ntu ?? 0) / 6) * 100)}% - 8px)` }} />
        </div>
        <div className="mt-1 flex justify-between font-num text-[10px] opacity-60"><span>0</span><span>1 concern</span><span>5 strong</span></div>
      </div>

      <div className="panel space-y-3 p-4">
        {(["tds_mgl", "temp_c"] as Indicator[]).map((i) => (
          <div key={i}>
            <div className="flex items-baseline justify-between">
              <span className="label-caps">{LABEL[i]}</span>
              <span className="font-num text-lg">{latest?.[i] ?? "—"} <span className="text-xs text-muted-foreground">{UNIT[i]}</span></span>
            </div>
            <Spark ind={i} h={44} />
            <StatusChip status={st(i)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PacketInspector() {
  const latest = useSim((s) => s.latest);
  const led = useSim((s) => s.sendLed);
  const buffer = useSim((s) => s.buffer.length);
  const [open, setOpen] = useState(false);
  const ledCls = led === "sent" ? "text-st-normal" : led === "buffering" ? "text-st-concern" : "text-st-nodata";
  return (
    <div className="panel mt-4 p-3">
      <button onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-4 text-xs">
        <span className="label-caps">Packet inspector</span>
        <span className={`flex items-center gap-1.5 ${ledCls}`}>
          <span className="glow-dot size-2 rounded-full bg-current" /> {led === "sent" ? "Sent" : led === "buffering" ? `Buffering (${buffer})` : "Offline"}
        </span>
        <span className="font-num text-muted-foreground">seq {latest?.seq ?? "—"}</span>
        <span className="font-num text-muted-foreground">{latest?.ts ?? ""}</span>
        <span className="font-num text-muted-foreground">RSSI {latest?.rssi ?? "—"} dBm</span>
        <span className="ml-auto text-muted-foreground">{open ? "Hide JSON" : "Show JSON"}</span>
      </button>
      {open && <pre className="mt-3 overflow-x-auto rounded-md bg-background p-3 font-num text-[11px] text-glow">{JSON.stringify(latest, null, 2)}</pre>}
    </div>
  );
}

function Notification() {
  const n = useSim((s) => s.notice);
  if (!n) return null;
  return (
    <div className="fixed right-4 top-4 z-50 w-80 rounded-2xl border border-border bg-popover p-3 shadow-2xl">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Send className="size-3.5 text-glow" /> Telegram · Jal Rakshak bot
        <span className={`ml-auto ${n.delivery === "retrying" ? "text-st-concern" : n.delivery === "sent" ? "text-st-normal" : ""}`}>
          {n.delivery === "sending" ? "Sending…" : n.delivery === "sent" ? "Delivery sent" : "Failed, retrying"}
        </span>
      </div>
      <p className="mt-2 text-sm">{n.text}</p>
    </div>
  );
}

function IndicatorDetail() {
  const sel = useSim((s) => s.selected);
  const select = useSim((s) => s.select);
  const latest = useSim((s) => s.latest);
  const ev = useSim((s) => (sel ? s.evals[sel] : null));
  if (!sel || !ev) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-background/70 p-4" onClick={() => select(null)}>
      <div className="panel w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="label-caps">{LABEL[sel]}</span>
          <button onClick={() => select(null)} aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="mt-2 font-num text-4xl">{latest?.[sel] ?? "—"} <span className="text-sm text-muted-foreground">{UNIT[sel]}</span></div>
        <div className="mt-2"><StatusChip status={ev.status} size="lg" /></div>
        <p className="mt-1 text-xs text-muted-foreground">{ev.reason || STATUS_META[ev.status].todo}</p>
        <div className="mt-4"><Spark ind={sel} h={90} /></div>
        <p className="mt-3 text-[10px] text-muted-foreground">Limits are placeholders — expert to confirm. This is an early-warning demo, not a water-safety certificate.</p>
      </div>
    </div>
  );
}
