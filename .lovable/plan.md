# Jal Rakshak: sensor simulation in the control-room style

Build the main simulation screen to look like the two reference images: a dark control room with a 3D isometric model in the centre, thin glowing lines, slim side panels and summary cards along the bottom.

## Look and feel
- Background is near-black charcoal (#0d0f12) with a faint grid. Panels are dark (#16191d) with thin 1px borders and labels in small caps.
- Cyan/teal (#2dd4bf) marks live data and the moving data packets. Amber (#f59e0b) and deep orange/red (#ef4444) are used only for alerts, as in the red "Warning" tower in the reference.
- A white card in the middle of the bottom row holds the main readout, like "Turbine Stability" in the reference.
- Fonts: Space Grotesk for headings and JetBrains Mono for numbers. Motion stays minimal, and there is a light theme toggle.

## Layout (desktop; the panels stack on phone)
```text
+-------------------------------------------------------------+
| logo  [Tank][Borewell 2][Anganwadi]  SIMULATED  theme  bell |
+---------+-------------------------------------+-------------+
| SOURCE  |                                     | DEMO PANEL  |
| DATA    |   3D isometric digital twin         | scenarios   |
| STATUS  |   tank > enclosure > flow cell      | speed 1/10/60x |
| DEVICE  |   > cloud > phone, callout pins     | packet LED  |
+---------+-------------------------------------+-------------+
| pH gauge | TURBIDITY (white card) | TDS / Temp trend chart  |
+-------------------------------------------------------------+
| packet inspector drawer (latest JSON, seq, RSSI, buffered)  |
+-------------------------------------------------------------+
```

## 3D scene
- A matte grey-white base slab like in the references. On it: the overhead tank on its stand, the pipe to the wall-mounted sensor box, a see-through flow cell with 4 probes and cables, a drain pipe, and a cloud node and phone on a raised pad.
- Calm blue water. The water turns murky brown in the "contaminate" scenario.
- Callout pins with leader lines show live values ("pH 7.4"). Clicking a pin opens that sensor's details.
- Concern: the part glows red/orange and a warning tag floats above it. Sensor fault: the probe turns grey-blue and shows a wrench tag with "Check device".
- Small glowing cyan packets travel along the lines from the device to the cloud, then to the phone. When the network is cut they pile up at the device ("12 buffered") and then burst through in order.
- 2D SCADA-style schematic view, using the same colours, that the user can switch to.

## Behaviour (as described in your brief)
- The simulator produces readings in the exact payload format, runs scenarios S1 to S7 plus Reset, and has speed control.
- Detection: validity checks, fault rules, placeholder thresholds, robust z-score, hysteresis and alert manager.
- A phone-style Telegram notification pops up on alerts.
- This first pass builds the hero simulation screen. Status Board, Source Detail, Alerts, Device Health and About come next, in the same style.

## Technical details
- three, @react-three/fiber@9 and drei@10, on a route with `ssr: false`. Shapes are built in code (no outside models), with Lightformer lighting and the `data-scene-ready` signal.
- `src/simulator/` (engine and scenarios) and `src/detection/` (pure functions) don't depend on React, so a real backend can replace them later. Vitest covers the thresholds, z-score, flat-line detection and hysteresis.
- A zustand store holds what the screen shows. Values that change every frame live in refs.
- Colours are set as oklch values in styles.css, and both themes are covered.
- I'll check it with screenshots of the normal, contaminate and network-cut scenarios.
