import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Line, OrthographicCamera, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useSim } from "@/store/sim";
import type { Indicator } from "@/simulator/types";
import { LABEL, UNIT, type Status } from "@/detection";
import { StatusChip } from "./StatusChip";

/*
 * Hero: one close-up isometric sensor board. Board top sits at y = TOP.
 * Axes: +x = screen right/down, +z = screen left/down (camera at +x +y +z).
 */
const TOP = 0.1;
const C = {
  pcb: "#1d6b45",
  pcbEdge: "#14502f",
  copper: "#d39a4a",
  gold: "#e5c26a",
  esp: "#16181b",
  shield: "#c9ced3",
  glow: "#2dd4bf",
  amber: "#f59e0b",
  orange: "#ea580c",
  device: "#7c93b0",
  water: "#3d8fd6",
  murky: "#8a6a3a",
};

type V3 = [number, number, number];
interface ModuleDef {
  x: number;
  color: string;
  size: [number, number];
}
const MODS: Record<Indicator, ModuleDef> = {
  ph: { x: -1.7, color: "#2563eb", size: [0.72, 0.6] },
  turbidity_ntu: { x: -0.85, color: "#23272e", size: [0.72, 0.6] },
  tds_mgl: { x: 0, color: "#0d9488", size: [0.72, 0.6] },
  temp_c: { x: 0.85, color: "#b91c1c", size: [0.6, 0.5] },
};
const IND: Indicator[] = ["ph", "turbidity_ntu", "tds_mgl", "temp_c"];
const MOD_Z = 0.6;
const CUP_Z = 1.55;
const ESP = { x: 0.9, z: -0.45, w: 1.3, d: 0.7 };
const ANTENNA: V3 = [ESP.x + ESP.w / 2 - 0.08, TOP + 0.2, ESP.z];
const JACK: V3 = [2.18, TOP + 0.12, 0.9];
const LED_POS: V3[] = [
  [1.8, TOP, -1.15],
  [2.0, TOP, -1.15],
  [2.2, TOP, -1.15],
];

const flag = (s: Status) =>
  s === "strong" ? C.orange : s === "concern" ? C.amber : s === "device" ? C.device : null;

/* ---------------- copper traces (flat, on the PCB) ---------------- */
function Trace({ pts, w = 0.025 }: { pts: [number, number][]; w?: number }) {
  return (
    <>
      {pts.slice(1).map((b, i) => {
        const a = pts[i]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const horiz = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
        return (
          <mesh key={i} position={[(a[0] + b[0]) / 2, TOP + 0.003, (a[1] + b[1]) / 2]}>
            <boxGeometry args={horiz ? [len + w, 0.006, w] : [w, 0.006, len + w]} />
            <meshStandardMaterial color={C.copper} metalness={0.7} roughness={0.35} />
          </mesh>
        );
      })}
      {[pts[0]!, pts[pts.length - 1]!].map((p, i) => (
        <mesh key={`v${i}`} position={[p[0], TOP + 0.004, p[1]]}>
          <cylinderGeometry args={[w * 1.4, w * 1.4, 0.008, 12]} />
          <meshStandardMaterial color={C.gold} metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </>
  );
}

function Traces() {
  const routes: [number, number][][] = [];
  IND.forEach((ind, i) => {
    const x = MODS[ind].x;
    const top = MOD_Z - MODS[ind].size[1] / 2;
    // module -> ESP32 (non-crossing bus)
    for (const o of [0, 0.07]) {
      if (i === 3) routes.push([[x + o - 0.03, top], [x + o - 0.03, ESP.z + ESP.d / 2]]);
      else {
        const zb = -0.25 - (2 - i) * 0.15 + o * 0;
        routes.push([[x + o, top], [x + o, zb - o], [ESP.x - ESP.w / 2, zb - o]]);
      }
    }
    // module -> probe pad (3 short parallel traces)
    for (const o of [-0.1, 0, 0.1]) routes.push([[x + o, MOD_Z + MODS[ind].size[1] / 2], [x + o, CUP_Z - 0.3]]);
  });
  // resistor area -> ESP32
  routes.push([[-0.45, -1.1], [0.6, -1.1], [0.6, ESP.z - ESP.d / 2]]);
  routes.push([[-0.45, -1.2], [0.75, -1.2], [0.75, ESP.z - ESP.d / 2]]);
  // ESP32 -> LEDs (nested, no crossings)
  LED_POS.forEach((p, k) => {
    const z = -0.5 - (2 - k) * 0.1;
    routes.push([[ESP.x + ESP.w / 2, z], [p[0], z], [p[0], p[2] + 0.07]]);
  });
  // DC jack -> ESP32
  routes.push([[JACK[0] - 0.2, JACK[2]], [1.9, JACK[2]], [1.9, -0.2], [ESP.x + ESP.w / 2, -0.2]]);
  routes.push([[JACK[0] - 0.2, JACK[2] + 0.1], [1.75, JACK[2] + 0.1], [1.75, -0.1], [ESP.x + ESP.w / 2, -0.1]]);
  return (
    <>
      {routes.map((r, i) => (
        <Trace key={i} pts={r} />
      ))}
    </>
  );
}

/* ---------------- sensor interface modules ---------------- */
function Module({ ind }: { ind: Indicator }) {
  const m = MODS[ind];
  const st = useSim((s) => (s.overall === "nodata" ? "nodata" : s.evals[ind].status));
  const select = useSim((s) => s.select);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const f = flag(st);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    const pulse = st === "concern" || st === "strong" ? 0.45 + Math.sin(clock.elapsedTime * 4) * 0.25 : f ? 0.25 : 0;
    mat.current.emissiveIntensity = pulse;
  });
  const [w, d] = m.size;
  const color = st === "device" ? C.device : st === "nodata" ? "#3b4148" : m.color;
  return (
    <group position={[m.x, TOP, MOD_Z]} onClick={() => select(ind)}>
      <RoundedBox args={[w, 0.05, d]} radius={0.02} position={[0, 0.07, 0]} castShadow>
        <meshStandardMaterial ref={mat} color={color} emissive={f ?? "#000"} roughness={0.35} metalness={0.1} />
      </RoundedBox>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[(sx * w) / 2.5, 0.025, (sz * d) / 2.5]}>
            <cylinderGeometry args={[0.02, 0.02, 0.05, 8]} />
            <meshStandardMaterial color={C.shield} metalness={0.8} />
          </mesh>
        )),
      )}
      <mesh position={[0, 0.115, -0.08]}>
        <boxGeometry args={[w * 0.3, 0.035, d * 0.3]} />
        <meshStandardMaterial color="#0b0b0c" roughness={0.25} />
      </mesh>
      {ind === "ph" && (
        <mesh position={[0, 0.17, d / 2 - 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 0.2, 24]} />
          <meshStandardMaterial color={C.gold} metalness={0.9} roughness={0.2} />
        </mesh>
      )}
      {ind === "turbidity_ntu" && (
        <group position={[0, 0.16, d / 2 - 0.12]}>
          <mesh>
            <boxGeometry args={[0.32, 0.14, 0.18]} />
            <meshStandardMaterial color="#0a0a0b" roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.095]}>
            <circleGeometry args={[0.045, 20]} />
            <meshPhysicalMaterial color="#9fd8ff" roughness={0.05} metalness={0.2} />
          </mesh>
        </group>
      )}
      {ind === "tds_mgl" && (
        <group position={[0, 0.14, d / 2 - 0.1]}>
          <mesh>
            <boxGeometry args={[0.26, 0.1, 0.14]} />
            <meshStandardMaterial color="#f5f5f4" roughness={0.4} />
          </mesh>
          {[-0.05, 0.05].map((x) => (
            <mesh key={x} position={[x, 0.06, 0]}>
              <boxGeometry args={[0.03, 0.03, 0.03]} />
              <meshStandardMaterial color={C.gold} metalness={0.8} />
            </mesh>
          ))}
        </group>
      )}
      {ind === "temp_c" && (
        <>
          <mesh position={[-0.1, 0.16, 0.1]} rotation={[0, Math.PI / 2, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.1, 16, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color="#0b0b0c" side={THREE.DoubleSide} />
          </mesh>
          {/* 4.7k pull-up resistor */}
          <mesh position={[0.13, 0.14, 0.08]} rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[0.03, 0.1, 6, 12]} />
            <meshStandardMaterial color="#d6c39a" />
          </mesh>
        </>
      )}
    </group>
  );
}

/* ---------------- probes standing in clear cups at the board edge ---------------- */
function Probe({ ind }: { ind: Indicator }) {
  const x = MODS[ind].x;
  const turb = useSim((s) => s.latest?.turbidity_ntu ?? 0.6);
  const offline = useSim((s) => s.overall === "nodata");
  const water = useRef<THREE.MeshStandardMaterial>(null);
  const target = useMemo(() => {
    const k = ind === "turbidity_ntu" ? Math.min(1, Math.max(0, (turb - 0.8) / 5)) : 0;
    return new THREE.Color(C.water).lerp(new THREE.Color(C.murky), k);
  }, [turb, ind]);
  useFrame((_, d) => water.current?.color.lerp(target, Math.min(1, d * 2)));
  return (
    <group position={[x, TOP, CUP_Z]}>
      {/* gold landing pad the probe plugs into */}
      <mesh position={[0, 0.004, -0.3]}>
        <boxGeometry args={[0.3, 0.008, 0.08]} />
        <meshStandardMaterial color={C.gold} metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.28, 0.25, 0.54, 36, 1, true]} />
        <meshPhysicalMaterial color="#ffffff" roughness={0.05} transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.26, 0.24, 0.38, 36]} />
        <meshStandardMaterial ref={water} color={C.water} transparent opacity={offline ? 0.4 : 0.75} roughness={0.15} />
      </mesh>
      {ind === "ph" && (
        <>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.7, 20]} />
            <meshPhysicalMaterial color="#e6f4ff" roughness={0.05} transparent opacity={0.6} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <sphereGeometry args={[0.07, 20, 20]} />
            <meshPhysicalMaterial color="#e6f4ff" roughness={0.05} transparent opacity={0.7} />
          </mesh>
          <mesh position={[0, 0.85, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.14, 20]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        </>
      )}
      {ind === "turbidity_ntu" && (
        <>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.65, 24]} />
            <meshStandardMaterial color="#1a1c20" roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.2, 0.101]}>
            <boxGeometry args={[0.08, 0.1, 0.01]} />
            <meshPhysicalMaterial color="#9fd8ff" roughness={0.05} />
          </mesh>
        </>
      )}
      {ind === "tds_mgl" && (
        <>
          <mesh position={[0, 0.72, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.25, 20]} />
            <meshStandardMaterial color="#f5f5f4" />
          </mesh>
          {[-0.04, 0.04].map((o) => (
            <mesh key={o} position={[o, 0.33, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.55, 8]} />
              <meshStandardMaterial color="#cfd4d9" metalness={0.9} roughness={0.2} />
            </mesh>
          ))}
        </>
      )}
      {ind === "temp_c" && (
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.8, 16]} />
          <meshStandardMaterial color="#cfd4d9" metalness={0.95} roughness={0.15} />
        </mesh>
      )}
    </group>
  );
}

/* ---------------- ESP32, LEDs, power, resistors ---------------- */
function Esp32({ pulse }: { pulse: React.MutableRefObject<number> }) {
  const shield = useRef<THREE.MeshStandardMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, dRaw) => {
    const d = Math.min(dRaw, 0.05);
    pulse.current = Math.max(0, pulse.current - d * 1.2);
    const p = pulse.current;
    if (shield.current) shield.current.emissiveIntensity = p * 0.6;
    if (ring.current && ringMat.current) {
      const t = 1 - p;
      ring.current.scale.setScalar(0.3 + t * 2.2);
      ringMat.current.opacity = p * 0.8;
    }
  });
  return (
    <group position={[ESP.x, TOP, ESP.z]}>
      <RoundedBox args={[ESP.w, 0.06, ESP.d]} radius={0.02} position={[0, 0.06, 0]} castShadow>
        <meshStandardMaterial color={C.esp} roughness={0.4} />
      </RoundedBox>
      <RoundedBox args={[0.82, 0.08, 0.56]} radius={0.015} position={[-0.12, 0.13, 0]}>
        <meshStandardMaterial ref={shield} color={C.shield} emissive={C.glow} metalness={0.9} roughness={0.22} />
      </RoundedBox>
      {/* meandering antenna trace at the edge */}
      {[-0.2, -0.1, 0, 0.1, 0.2].map((z) => (
        <mesh key={z} position={[ESP.w / 2 - 0.12, 0.095, z]}>
          <boxGeometry args={[0.16, 0.005, 0.025]} />
          <meshStandardMaterial color={C.copper} metalness={0.7} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <group key={s} position={[-0.12, 0.09, (s * ESP.d) / 2 - s * 0.04]}>
          {Array.from({ length: 13 }).map((_, i) => (
            <mesh key={i} position={[(i - 6) * 0.07, 0, 0]}>
              <boxGeometry args={[0.035, 0.012, 0.04]} />
              <meshStandardMaterial color={C.gold} metalness={0.85} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh ref={ring} position={[ESP.w / 2 - 0.08, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.18, 0.012, 8, 48]} />
        <meshBasicMaterial ref={ringMat} color={C.glow} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Leds({ pulse }: { pulse: React.MutableRefObject<number> }) {
  const led = useSim((s) => s.sendLed);
  const offline = useSim((s) => s.overall === "nodata");
  const send = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (!send.current) return;
    const blinkBuf = led === "buffering" && Math.sin(clock.elapsedTime * 6) > 0;
    const on = !offline && (pulse.current > 0.55 || blinkBuf);
    send.current.color.set(on ? C.amber : "#3a2a10");
  });
  const power = offline ? "#1f2a22" : "#22c55e";
  const wifi = offline || led !== "sent" ? "#4b5563" : "#3b82f6";
  return (
    <>
      {LED_POS.map((p, i) => (
        <group key={i} position={p}>
          <mesh position={[0, 0.03, 0]}>
            <boxGeometry args={[0.1, 0.06, 0.07]} />
            <meshStandardMaterial color="#e5e7eb" />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <sphereGeometry args={[0.04, 16, 16]} />
            {i === 2 ? (
              <meshBasicMaterial ref={send} color="#3a2a10" toneMapped={false} />
            ) : (
              <meshBasicMaterial color={i === 0 ? power : wifi} toneMapped={false} />
            )}
          </mesh>
        </group>
      ))}
    </>
  );
}

function PowerAndResistors() {
  return (
    <>
      <group position={JACK}>
        <mesh>
          <boxGeometry args={[0.36, 0.24, 0.3]} />
          <meshStandardMaterial color="#121315" roughness={0.35} />
        </mesh>
        <mesh position={[0.181, 0.02, 0]} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[0.07, 20]} />
          <meshStandardMaterial color="#000" />
        </mesh>
      </group>
      {/* voltage divider */}
      {[-1.05, -0.85, -0.65].map((x, i) => (
        <mesh key={x} position={[x, TOP + 0.04, -1.15 - (i % 2) * 0.05]} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.03, 0.12, 6, 12]} />
          <meshStandardMaterial color={i === 1 ? "#5b8fd6" : "#d6c39a"} />
        </mesh>
      ))}
      <mesh position={[1.75, TOP + 0.09, 0.35]}>
        <cylinderGeometry args={[0.09, 0.09, 0.18, 20]} />
        <meshStandardMaterial color="#1e3a8a" />
      </mesh>
    </>
  );
}

/* ---------------- packets leaving to the inspector (off the right edge) ---------------- */
function Packets({ pulse }: { pulse: React.MutableRefObject<number> }) {
  const burst = useSim((s) => s.packetBurst);
  const live = useRef<{ t: number; delay: number }[]>([]);
  const prev = useRef(burst);
  const group = useRef<THREE.Group>(null);
  const from = useMemo(() => new THREE.Vector3(...ANTENNA), []);
  const to = useMemo(() => new THREE.Vector3(7, 1.6, -5), []);
  useEffect(() => {
    const n = burst - prev.current;
    prev.current = burst;
    if (n > 0) pulse.current = 1;
    for (let i = 0; i < Math.min(n, 16); i++) live.current.push({ t: 0, delay: i * 0.1 });
  }, [burst, pulse]);
  useFrame((_, dRaw) => {
    const d = Math.min(dRaw, 0.05);
    live.current = live.current.filter((p) => p.t < 1);
    live.current.forEach((p) => (p.delay > 0 ? (p.delay -= d) : (p.t += d * 0.9)));
    group.current?.children.forEach((m, i) => {
      const p = live.current[i];
      m.visible = !!p && p.delay <= 0;
      if (p) m.position.lerpVectors(from, to, p.t).setY(from.y + Math.sin(p.t * Math.PI) * 0.6 + p.t * 1.2);
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: 16 }).map((_, i) => (
        <mesh key={i} visible={false}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={C.glow} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------- callouts (DOM, projected each frame) ---------------- */
type CalloutKey = Indicator | "esp" | "leds" | "power";
const ANCHORS: Record<CalloutKey, V3> = {
  ph: [MODS.ph.x, TOP + 0.9, CUP_Z],
  turbidity_ntu: [MODS.turbidity_ntu.x, TOP + 0.75, CUP_Z],
  tds_mgl: [MODS.tds_mgl.x, TOP + 0.6, CUP_Z + 0.2],
  temp_c: [MODS.temp_c.x, TOP + 0.4, CUP_Z + 0.25],
  esp: [ESP.x - 0.1, TOP + 0.2, ESP.z - 0.2],
  leds: [2.0, TOP + 0.1, -1.15],
  power: [JACK[0], JACK[1] + 0.1, JACK[2]],
};
const PINS: Record<CalloutKey, V3> = {
  ph: [-3.4, 1.4, 1.4],
  turbidity_ntu: [-3.0, 0.5, 2.6],
  tds_mgl: [0.2, -0.4, 3.6],
  temp_c: [2.6, -0.5, 2.8],
  esp: [1.0, 1.6, -2.3],
  leds: [2.7, 0.9, -1.8],
  power: [3.5, 0.5, 0.5],
};
const els: Partial<Record<CalloutKey, HTMLElement | null>> = {};
let badgeEl: HTMLElement | null = null;

function Projector({ tilt, compact }: { tilt: React.RefObject<THREE.Group | null>; compact: boolean }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const g = tilt.current;
    if (!g) return;
    g.updateMatrixWorld();
    const place = (el: HTMLElement | null | undefined, p: V3) => {
      if (!el) return;
      v.set(...p).applyMatrix4(g.matrixWorld).project(camera);
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    };
    if (!compact) (Object.keys(PINS) as CalloutKey[]).forEach((k) => place(els[k], PINS[k]));
    place(badgeEl, [ESP.x - 0.1, TOP + 0.45, ESP.z + 0.1]);
  });
  return null;
}

function LeaderLines() {
  return (
    <>
      {(Object.keys(PINS) as CalloutKey[]).map((k) => (
        <Line key={k} points={[ANCHORS[k], PINS[k]]} color="#9aa3ad" lineWidth={1} transparent opacity={0.55} />
      ))}
    </>
  );
}

function SensorCallout({ ind, inline = false }: { ind: Indicator; inline?: boolean }) {
  const v = useSim((s) => s.latest?.[ind]);
  const st = useSim((s) => (s.overall === "nodata" ? "nodata" : s.evals[ind].status));
  const select = useSim((s) => s.select);
  return (
    <button
      ref={inline ? undefined : (el) => void (els[ind] = el)}
      onClick={() => select(ind)}
      aria-label={`${LABEL[ind]} details`}
      className={
        inline
          ? `panel flex flex-col items-start gap-0.5 px-2 py-1.5 text-left st-ring-${st}`
          : `panel absolute left-0 top-0 z-10 flex -translate-y-1/2 flex-col items-start gap-0.5 px-2.5 py-1.5 text-left st-ring-${st}`
      }
      style={inline ? undefined : { willChange: "transform", marginLeft: 6 }}
    >
      <span className="font-num text-[12px] text-foreground">
        {LABEL[ind]} {st === "nodata" ? "—" : (v ?? "—")} <span className="text-muted-foreground">{UNIT[ind]}</span>
      </span>
      <StatusChip status={st} />
    </button>
  );
}

function PartLabel({ k, text }: { k: CalloutKey; text: string }) {
  return (
    <span
      ref={(el) => void (els[k] = el)}
      className="label-caps panel absolute left-0 top-0 z-10 -translate-y-1/2 whitespace-nowrap px-2 py-1"
      style={{ willChange: "transform", marginLeft: 6 }}
    >
      {text}
    </span>
  );
}

function EspBadge() {
  const seq = useSim((s) => s.latest?.seq);
  const buffered = useSim((s) => s.buffer.length);
  const offline = useSim((s) => s.overall === "nodata");
  return (
    <div
      ref={(el) => void (badgeEl = el)}
      className="pointer-events-none absolute left-0 top-0 z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1"
      style={{ willChange: "transform" }}
    >
      {buffered > 0 && (
        <span className="rounded-md px-1.5 py-0.5 font-num text-[10px] font-semibold st-tag-concern">{buffered} buffered</span>
      )}
      <span className="rounded bg-background/80 px-1.5 py-0.5 font-num text-[10px] text-glow">
        {offline ? "no signal" : `#${seq ?? "—"}`}
      </span>
    </div>
  );
}

/* ---------------- camera fit, hover tilt, scroll zoom ---------------- */
function Rig({ tilt, zoomMul, compact }: { tilt: React.RefObject<THREE.Group | null>; zoomMul: React.MutableRefObject<number>; compact: boolean }) {
  const { camera, size, pointer } = useThree();
  useFrame((_, dRaw) => {
    const d = Math.min(dRaw, 0.05);
    const fit = compact ? Math.min(size.width / 5.6, size.height / 4.2) : Math.min(size.width / 9.6, size.height / 5.6);
    const cam = camera as THREE.OrthographicCamera;
    cam.zoom += (fit * zoomMul.current - cam.zoom) * Math.min(1, d * 8);
    cam.updateProjectionMatrix();
    const g = tilt.current;
    if (g) {
      const k = Math.min(1, d * 3);
      g.rotation.y += (pointer.x * 0.06 - g.rotation.y) * k;
      g.rotation.x += (-pointer.y * 0.04 - g.rotation.x) * k;
    }
  });
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (!done.current) {
      done.current = true;
      onReady();
    }
  });
  return null;
}

export default function Scene() {
  const [ready, setReady] = useState(false);
  const [compact, setCompact] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const tilt = useRef<THREE.Group>(null);
  const pulse = useRef(0);
  const zoomMul = useRef(1);
  const offline = useSim((s) => s.overall === "nodata");

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCompact((e?.contentRect.width ?? 999) < 620));
    ro.observe(el);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomMul.current = Math.min(2, Math.max(0.7, zoomMul.current * (e.deltaY > 0 ? 0.92 : 1.08)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden" data-scene-ready={ready ? "true" : undefined}>
      <Canvas shadows dpr={[1, 2]}>
        <OrthographicCamera makeDefault position={[9, 8, 9]} zoom={80} near={-50} far={100} onUpdate={(c) => c.lookAt(compact ? 0 : 0.3, 0, compact ? 0.3 : -0.3)} />
        <ambientLight intensity={offline ? 0.12 : 0.45} />
        <directionalLight position={[4, 10, 6]} intensity={offline ? 0.4 : 1.5} castShadow shadow-mapSize={[1024, 1024]} />
        <Environment resolution={64}>
          <Lightformer intensity={offline ? 0.5 : 2} position={[0, 5, 0]} scale={[10, 10, 1]} />
          <Lightformer intensity={offline ? 0.2 : 1} color="#9fe" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        </Environment>
        <Rig tilt={tilt} zoomMul={zoomMul} compact={compact} />
        <group ref={tilt}>
          <RoundedBox args={[4.7, 0.1, 3.6]} radius={0.04} position={[0.1, TOP / 2, 0.25]} castShadow receiveShadow>
            <meshStandardMaterial color={offline ? "#13402a" : C.pcb} roughness={0.32} metalness={0.15} />
          </RoundedBox>
          <mesh position={[0.1, -0.005, 0.25]}>
            <boxGeometry args={[4.74, 0.02, 3.64]} />
            <meshStandardMaterial color={C.pcbEdge} />
          </mesh>
          {[[-2.1, -1.4], [2.3, -1.4], [-2.1, 1.9], [2.3, 1.9]].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x!, TOP + 0.003, z!]}>
              <cylinderGeometry args={[0.07, 0.07, 0.006, 20]} />
              <meshStandardMaterial color={C.gold} metalness={0.8} />
            </mesh>
          ))}
          <Traces />
          {IND.map((i) => (
            <Module key={i} ind={i} />
          ))}
          {IND.map((i) => (
            <Probe key={i} ind={i} />
          ))}
          <Esp32 pulse={pulse} />
          <Leds pulse={pulse} />
          <PowerAndResistors />
          {!compact && <LeaderLines />}
        </group>
        <Packets pulse={pulse} />
        <Projector tilt={tilt} compact={compact} />
        <Ready onReady={() => setReady(true)} />
      </Canvas>

      <EspBadge />
      {!compact && (
        <>
          {IND.map((i) => (
            <SensorCallout key={i} ind={i} />
          ))}
          <PartLabel k="esp" text="ESP32" />
          <PartLabel k="leds" text="Status LEDs" />
          <PartLabel k="power" text="5 V power" />
        </>
      )}
      {compact && (
        <div className="absolute inset-x-2 bottom-14 grid grid-cols-2 gap-2">
          {IND.map((i) => (
            <SensorCallout key={i} ind={i} inline />
          ))}
        </div>
      )}
    </div>
  );
}
