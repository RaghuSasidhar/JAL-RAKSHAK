# Jal Rakshak — Village Water Quality Monitor (Simulation)

A control-room style simulation of a village water-quality monitoring node: a PCB
sensor board reads pH, turbidity, TDS and temperature, sends packets to a cloud,
and a detection layer turns those readings into alerts. Everything runs in the
browser — no device, no backend, no accounts.

Two screens:

| Route | What it shows |
| --- | --- |
| `/` | The simulator: 3D board view (or 2D schematic), live sensor readouts, scenario controls, packet inspector, alert timeline |
| `/officials` | The officials dashboard: totals, water sources, live readings, and the alert list with acknowledge / action / lab-result steps |

Open `/`, pick a scenario in the Demo panel, and set the speed to **60x** so
changes appear within seconds. **Officials dashboard** is the button at the top
right.

## Scenarios

| ID | Name | What happens |
| --- | --- | --- |
| S1 | Contaminate tank | Turbidity climbs from clear to muddy over ~20 s |
| S2 | Drift pH | pH slides slowly downwards |
| S3 | TDS jump | TDS steps to ~780 mg/L |
| S4 | Stick sensor | pH repeats the same value (flat line) |
| S5 | Unplug device | No readings at all → "No data" |
| S6 | Clean day | Everything back to normal |
| S7 | Network cut | Readings buffer at the device, then burst through in order when the link returns |

## How a reading becomes an alert

1. **Validity** — a value outside its physical range is treated as a device fault.
2. **Fault rules** — a value repeating for 10 readings means a stuck sensor.
3. **Thresholds** — placeholder warning limits (pH 6.5–8.5, turbidity 1 / 5 NTU,
   TDS 500 / 2000 mg/L). *These are placeholders and need an expert to confirm.*
4. **Robust z-score** — a reading far from its own recent median flags a concern;
   while the baseline is still building, the status reads "Learning normal range".
5. **Hysteresis** — a raised flag clears only after 3 consecutive normal readings,
   so an alert does not flicker on and off.

Alerts carry a state (`New → Acknowledged → Action recorded → Lab result recorded
→ Closed`) and a timeline. A phone-style notification pops up when one is raised.

## Project layout

```text
src/
  simulator/     engine.ts, types.ts — generates readings in the payload format
  detection/     index.ts — validity, fault rules, thresholds, z-score, hysteresis
  store/sim.ts   zustand store: the only place the two above meet the UI
  components/
    twin/        Scene.tsx (3D board), Schematic.tsx (2D), StatusChip.tsx
    ui/          shadcn/ui primitives
  routes/        index.tsx (simulator), officials.tsx (dashboard)
  test/          vitest setup + routing test
```

`src/simulator` and `src/detection` are React-free pure modules on purpose: the
zustand store is the only glue, so a real device backend can replace the
simulator without touching the UI. Values that change every frame live in refs
inside the 3D scene, not in the store.

## Running it

```sh
npm install
npm run dev        # http://localhost:8080
```

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm run preview` | Serve the built app |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Tests

`npm test` covers the detection rules: threshold limits, robust z-score,
flat-line (stuck sensor) detection, and hysteresis behaviour, plus a routing
check. Add a small test next to `src/detection/detection.test.ts` whenever you
change a limit or a rule.

## Notes and current limits

- All data is simulated. Village overhead tank (`SRC-001`) is the live source;
  Borewell 2 and the Anganwadi tap are sample rows.
- Warning limits are placeholders pending expert review.
- The dashboard opens in the same tab. A second browser tab would run its own
  separate simulation, so scenarios set in one tab would not appear in the other.
- Still to build from the brief: Source Detail, a full Alerts page, Device
  Health, and About.

## Tech

TanStack Start (React 19) · three + @react-three/fiber + drei for the 3D board ·
zustand · Tailwind CSS v4 · recharts · vitest. Colours are semantic tokens in
`src/styles.css` (oklch), with a light theme toggle.

---

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/47348957-98bc-46cb-9a64-f15b178e5481).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
