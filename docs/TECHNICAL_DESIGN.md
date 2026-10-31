# Jal Rakshak — Technical Design Document

| | |
|---|---|
| Status | MVP (simulation only) |
| Scope | Browser app: sensor-board simulator (`/`) and officials dashboard (`/officials`) |
| Data | All readings are simulated. Warning limits are placeholders pending expert review. |

## 1. Purpose and goals

Jal Rakshak is an early-warning demo for village drinking-water sources. A simulated sensor board (pH, turbidity, TDS, temperature on an ESP32) produces readings every 5 s; detection rules classify each reading and raise alerts that officials acknowledge and close.

Goals:
- Show the full path *sensor → packet → detection → alert → official action* in one browser tab.
- Keep the simulator and detection logic pure so a real device + backend can replace the simulator without UI changes.
- Be honest: never present results as a water-safety certificate.

Non-goals (MVP): persistence, authentication, real hardware, real messaging (the Telegram-style notice is simulated), multi-source live data.

## 2. System context

```mermaid
flowchart LR
  Operator([Demo operator]) -->|picks scenario S1–S7| App
  Official([Village official]) -->|reviews / acknowledges alerts| App
  subgraph App[Jal Rakshak web app - browser]
    Sim[Sensor simulator]
    Det[Detection rules]
    UI[Board view, schematic, dashboard]
  end
  App -. future .-> Device[[Real ESP32 sensor node]]
  App -. future .-> Backend[(Backend + database)]
  App -. future .-> Msg[[Telegram / SMS]]
```

## 3. Architecture overview

The app is a TanStack Start (React 19, Vite) project. Both pages render client-only (`ssr: false`) because they depend on a live in-memory simulation and WebGL.

```mermaid
flowchart TB
  subgraph Pure["Pure TypeScript (no React)"]
    Types[simulator/types.ts<br/>Reading, ScenarioId]
    Engine[simulator/engine.ts<br/>createEngine, setScenario, step]
    Detect[detection/index.ts<br/>validity, thresholds, robust z,<br/>flat-line, hysteresis, worst]
  end
  subgraph Glue["State glue"]
    Store[store/sim.ts<br/>zustand store]
    Ticker[hooks/use-ticker.ts<br/>speed-scaled interval]
  end
  subgraph UI["React UI"]
    Index[routes/index.tsx<br/>Simulator page]
    Officials[routes/officials.tsx<br/>Officials dashboard]
    Scene[twin/Scene.tsx<br/>3D PCB board - R3F]
    Schem[twin/Schematic.tsx]
    Chip[twin/StatusChip.tsx]
  end
  Ticker -->|tick| Store
  Store --> Engine
  Store --> Detect
  Engine --> Types
  Detect --> Types
  Index --> Store
  Officials --> Store
  Index --> Scene & Schem & Chip
  Scene --> Store
```

**Rule:** `src/simulator` and `src/detection` never import React; the zustand store is the only module that joins them to the UI. Replacing the simulator with a network feed means changing only the store's `tick`.

## 4. Components

| Module | Responsibility |
|---|---|
| `simulator/types.ts` | `Reading` packet schema (`source_id, ts, seq, ph, turbidity_ntu, tds_mgl, temp_c, rssi, fw, cal, faults`), scenario list. |
| `simulator/engine.ts` | Deterministic step function, 5 s interval. Applies active scenario; S5 (unplug) returns `null`. |
| `detection/index.ts` | Per-indicator evaluation and overall status. Unit-tested in `detection.test.ts`. |
| `store/sim.ts` | Holds engine state, history (300), buffer, evals, alerts, notice, view, speed. Runs one detection pass per tick. |
| `hooks/use-ticker.ts` | Mounted once per page; calls `init()` then `tick()` every `5000 / speed` ms. |
| `twin/Scene.tsx` | Orthographic three.js scene: green PCB, sensor modules, probe cups, ESP32, LEDs, copper traces only (no wires). Reacts to status and packet events. |
| `twin/Schematic.tsx` | 2D alternative view. |
| `routes/officials.tsx` | KPIs, sources table, live readings with advice, open-alert actions. |

## 5. Data model

```mermaid
classDiagram
  class Reading {
    string source_id
    string ts
    number seq
    number|null ph
    number|null turbidity_ntu
    number|null tds_mgl
    number|null temp_c
    number rssi
    string fw
    string cal
    string[] faults
  }
  class IndicatorEval {
    Status status
    string reason
  }
  class Alert {
    string id
    Indicator indicator
    Status level
    AlertState state
    timeline[]
  }
  Reading "1" --> "4" IndicatorEval : evaluated into
  IndicatorEval "*" --> "0..1" Alert : raises / clears
```

`Status = normal | concern | strong | device | nodata | learning`
`AlertState = New → Acknowledged → Action recorded → Lab result recorded → Closed`

## 6. Reading lifecycle (one tick)

```mermaid
sequenceDiagram
  participant T as Ticker
  participant S as Store
  participant E as Engine
  participant D as Detection
  participant U as UI (board / dashboard)
  T->>S: tick()
  S->>E: step(engineState)
  E-->>S: reading | null
  alt reading is null
    S->>S: missed++ (≥3 → overall = nodata, gap in history)
  else network cut active
    S->>S: push to buffer, send LED = buffering
  else delivered (incl. buffered burst, in order)
    loop each indicator
      S->>D: evaluate(ind, reading, history)
      D-->>S: status + reason
      S->>D: applyHysteresis(raised, streak)
    end
    S->>S: overall = worst(statuses), open/update alerts, notice
  end
  S-->>U: state change → re-render, packet pulse, LEDs
```

## 7. Detection design

Evaluation order per indicator (first match wins):

```mermaid
flowchart TD
  A[Value] --> B{Valid & in sensor range?}
  B -- no --> DEV[device: check device]
  B -- yes --> C{Flat-line over last 10?}
  C -- yes --> DEV
  C -- no --> TH{Placeholder threshold}
  TH -- strong --> STRONG[strong concern]
  TH -- concern --> CON[concern]
  TH -- normal --> Z{History ≥ 48?}
  Z -- no --> LRN[learning]
  Z -- yes --> RZ{robust z > 4?}
  RZ -- yes --> CON
  RZ -- no --> NOR[normal]
```

- **Placeholder thresholds:** pH outside 6.5–8.5 → concern; turbidity > 1 NTU concern, > 5 strong; TDS > 500 mg/L concern, > 2000 strong. Temperature is anomaly-only.
- **Robust z-score:** `(x − median) / (1.4826 · MAD)` over a 60-reading window, with per-indicator MAD floors to avoid division blow-ups on quiet signals.
- **Hysteresis:** an alert clears only after 3 consecutive normal readings.
- **Overall status:** `worst()` priority `strong > concern > device > nodata > learning > normal`.
- **Warm start:** the store pre-generates 50 baseline readings so anomaly detection is active on first view.

## 8. Scenarios

| ID | Name | Engine effect | Expected outcome |
|---|---|---|---|
| S1 | Contaminate tank | Turbidity spike | Strong concern, notice popup |
| S2 | Drift pH | Slow pH ramp | Concern once outside range / z > 4 |
| S3 | TDS jump | Step increase in TDS | Concern or strong |
| S4 | Stick sensor | Constant value | Device (flat-line) |
| S5 | Unplug device | No packets | No data after 3 missed |
| S6 | Clean day | Quiet baseline | Normal |
| S7 | Network cut | Packets buffered on device | Buffered count, burst on reconnect |

## 9. Alert workflow

```mermaid
stateDiagram-v2
  [*] --> New : rule raises
  New --> Acknowledged : official acknowledges
  Acknowledged --> ActionRecorded : action noted
  ActionRecorded --> LabResultRecorded : lab result noted
  LabResultRecorded --> Closed
  New --> Closed : close with note
  Acknowledged --> Closed
  Closed --> [*]
```

Every transition appends a timeline entry with time and note.

## 10. Rendering

- `@react-three/fiber` + `drei`, orthographic camera, auto-fit, pointer tilt, scroll zoom.
- Only flat copper traces connect parts; label leader lines are UI, not wires.
- Under 620 px the board shrinks and readings move into a list.
- Design tokens (oklch) in `src/styles.css`; Space Grotesk + JetBrains Mono loaded in `__root.tsx`; dark default with light toggle.

## 11. Deployment

```mermaid
flowchart LR
  Dev[Source repo] --> Build[Vite build]
  Build --> Edge[Edge runtime - Cloudflare Workers]
  Edge -->|HTML + JS bundle| Browser[User browser]
  Browser -->|runs simulator + detection locally| Browser
```

All computation runs in the browser; the server only serves the app shell.

## 12. Future architecture (real deployment)

```mermaid
flowchart LR
  Node[ESP32 node<br/>pH, turbidity, TDS, temp] -->|HTTPS batch, store-and-forward| Ingest[/api/public/ingest<br/>device-key verified/]
  Ingest --> DB[(Readings, alerts, sources)]
  DB --> Rules[Detection worker<br/>same detection module]
  Rules --> DB
  Rules --> Notify[Telegram / SMS]
  DB --> Dash[Officials dashboard<br/>signed-in, role-based]
```

Migration path: the `Reading` schema is already the wire format; `detection/` moves server-side unchanged; the store's `tick` is replaced by a subscription to the database.

## 13. Testing

- `bunx vitest run` — detection unit tests (thresholds, z-score, flat-line, hysteresis, priority).
- Playwright screenshot checks for scenarios during development.

## 14. Risks and open questions

- Thresholds are placeholders; must be confirmed by a water-quality expert (BIS 10500 / local norms).
- Open alerts keep their first severity level; escalation rules are not yet defined.
- A sensor kit cannot detect bacteria — the UI must keep stating this is not a safety certificate.
- Multi-tab use runs separate simulations (no shared state without a backend).
