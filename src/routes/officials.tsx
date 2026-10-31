import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Droplets, ShieldCheck } from "lucide-react";
import { StatusChip } from "@/components/twin/StatusChip";
import { useTicker } from "@/hooks/use-ticker";
import { useSim } from "@/store/sim";
import { LABEL, STATUS_META, UNIT, type Status } from "@/detection";
import { INDICATORS } from "@/simulator/types";

export const Route = createFileRoute("/officials")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Officials Dashboard — Jal Rakshak" },
      { name: "description", content: "Overview of village water sources, open alerts and actions for officials." },
      { property: "og:title", content: "Officials Dashboard — Jal Rakshak" },
      { property: "og:description", content: "Source status, open alerts and field actions at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Officials,
});

function Officials() {
  useTicker();
  const overall = useSim((s) => s.overall);
  const evals = useSim((s) => s.evals);
  const latest = useSim((s) => s.latest);
  const alerts = useSim((s) => s.alerts);
  const alertAction = useSim((s) => s.alertAction);
  const open = alerts.filter((a) => a.state !== "Closed");
  const sources: { name: string; id: string; type: string; status: Status; updated: string }[] = [
    { name: "Village overhead tank", id: "SRC-001", type: "Overhead tank", status: overall, updated: latest?.ts.slice(11, 16) ?? "—" },
    { name: "Borewell 2", id: "SRC-002", type: "Borewell", status: "normal", updated: "Sample" },
    { name: "Anganwadi tap", id: "SRC-003", type: "Tap", status: "nodata", updated: "Sample" },
  ];
  const kpis = [
    { k: "Sources monitored", v: sources.length },
    { k: "Open alerts", v: open.length },
    { k: "Strong concerns", v: open.filter((a) => a.severity === "strong").length },
    { k: "Awaiting acknowledgement", v: open.filter((a) => a.state === "New").length },
  ];

  return (
    <div className="grid-bg min-h-screen bg-background p-3 text-foreground md:p-5">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-foreground text-background"><Droplets className="size-5" /></span>
        <div>
          <div className="font-semibold tracking-[0.18em]">JAL RAKSHAK</div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Officials dashboard · Gram Panchayat</div>
        </div>
        <span className="ml-auto rounded-md border border-st-concern/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-st-concern">Simulated data</span>
        <Link to="/" className="panel flex items-center gap-1.5 px-3 py-2 text-xs"><ArrowLeft className="size-3.5" /> Sensor simulator</Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((x) => (
          <div key={x.k} className="panel p-4">
            <div className="label-caps">{x.k}</div>
            <div className="mt-2 font-num text-4xl">{x.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="panel p-4">
          <div className="label-caps mb-3">Water sources</div>
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="pb-2">Source</th><th className="pb-2">Type</th><th className="pb-2">Status</th><th className="pb-2">Updated</th></tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2.5">{s.name}<div className="font-num text-[10px] text-muted-foreground">{s.id}</div></td>
                  <td>{s.type}</td>
                  <td><StatusChip status={s.status} /></td>
                  <td className="font-num text-xs">{s.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="label-caps mb-2 mt-6">Village overhead tank — live readings</div>
          <div className="grid gap-3 sm:grid-cols-4">
            {INDICATORS.map((i) => (
              <div key={i} className="rounded-md bg-secondary p-3">
                <div className="text-[11px] text-muted-foreground">{LABEL[i]}</div>
                <div className="font-num text-2xl">{latest?.[i] ?? "—"} <span className="text-xs text-muted-foreground">{UNIT[i]}</span></div>
                <StatusChip status={overall === "nodata" ? "nodata" : evals[i].status} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Advice: {STATUS_META[overall].todo}</p>
        </div>

        <div className="panel p-4">
          <div className="label-caps mb-3">Open alerts</div>
          {open.length === 0 && <p className="text-xs text-muted-foreground">No open alerts. Trigger a scenario in the simulator to see one here.</p>}
          <div className="space-y-2">
            {open.map((a) => (
              <div key={a.id} className={`rounded-md bg-secondary p-3 text-xs st-ring-${a.severity}`}>
                <div className="flex justify-between"><StatusChip status={a.severity} /><span className="text-muted-foreground">{a.state}</span></div>
                <p className="mt-1">{a.text}</p>
                <div className="mt-2 flex gap-1">
                  {a.state === "New" && <button onClick={() => alertAction(a.id, "Acknowledged", "Acknowledged by official")} className="rounded bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">Acknowledge</button>}
                  <button onClick={() => alertAction(a.id, "Closed", "Closed by official")} className="rounded border border-border px-2 py-0.5 text-[10px]">Close</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <footer className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="size-3.5" /> Early-warning demo, not a water-safety certificate.
      </footer>
    </div>
  );
}
