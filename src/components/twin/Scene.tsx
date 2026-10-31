import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Html, Lightformer, Line, OrthographicCamera, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useSim } from "@/store/sim";
import type { Indicator } from "@/simulator/types";
import { LABEL, UNIT, type Status } from "@/detection";
import { ESP_ANTENNA, SensorBoard, moduleWorld } from "./SensorBoard";

// Material palette for the 3D model (matte industrial, like the reference renders).
const P = {
  slab: "#3a3f46",
  slabEdge: "#121417",
  body: "#eef0f2",
  metal: "#9aa1a8",
  dark: "#30353b",
  water: "#3d8fd6",
  murky: "#8a6a3a",
  glow: "#2dd4bf",
  red: "#ef4444",
  amber: "#f59e0b",
  device: "#7c93b0",
};

const statusHex = (s: Status) =>
  s === "strong" ? P.red : s === "concern" ? P.amber : s === "device" ? P.device : null;

// Data path: enclosure -> cloud -> phone
const CLOUD: [number, number, number] = [2.9, 1.5, -1.6];
const PATH: [number, number, number][] = [
  ESP_ANTENNA,
  [ESP_ANTENNA[0], 3.2, ESP_ANTENNA[2]],
  [CLOUD[0], 3.2, CLOUD[2]],
  CLOUD,
];
const PATH2: [number, number, number][] = [CLOUD, [3.2, 0.5, 0.3]];

function Tank({ status }: { status: Status | null }) {
  const legs: [number, number][] = [
    [-0.55, -0.55],
    [0.55, -0.55],
    [-0.55, 0.55],
    [0.55, 0.55],
  ];
  return (
    <group position={[-2, 0, -1]}>
      {legs.map(([x, z], i) => (
        <mesh key={i} position={[x, 1, z]} castShadow>
          <boxGeometry args={[0.12, 2, 0.12]} />
          <meshStandardMaterial color={P.metal} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 2.9, 0]} castShadow>
        <cylinderGeometry args={[0.95, 0.95, 1.6, 40]} />
        <meshStandardMaterial
          color={status ? statusHex(status)! : P.body}
          emissive={status ? statusHex(status)! : "#000"}
          emissiveIntensity={status ? 0.4 : 0}
          roughness={0.45}
        />
      </mesh>
      <mesh position={[0, 3.75, 0]}>
        <cylinderGeometry args={[0.2, 0.95, 0.25, 40]} />
        <meshStandardMaterial color={P.metal} />
      </mesh>
    </group>
  );
}

function Pipe({ points, color = P.metal, r = 0.07 }: { points: [number, number, number][]; color?: string; r?: number }) {
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.05),
    [points],
  );
  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, 64, r, 12, false]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.4} />
    </mesh>
  );
}

const PROBES: { ind: Indicator; x: number }[] = [
  { ind: "ph", x: -0.3 },
  { ind: "turbidity_ntu", x: -0.1 },
  { ind: "tds_mgl", x: 0.1 },
  { ind: "temp_c", x: 0.3 },
];

function FlowCell() {
  const turb = useSim((s) => s.latest?.turbidity_ntu ?? 0.6);
  const evals = useSim((s) => s.evals);
  const offline = useSim((s) => s.overall === "nodata");
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const target = useMemo(() => {
    const k = Math.min(1, Math.max(0, (turb - 0.8) / 5));
    return new THREE.Color(P.water).lerp(new THREE.Color(P.murky), k);
  }, [turb]);
  useFrame((_, d) => {
    if (mat.current) mat.current.color.lerp(target, Math.min(1, d * 2));
  });
  return (
    <group position={[0.6, 0, -0.6]}>
      {/* flow cell */}
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 0.9, 40]} />
        <meshPhysicalMaterial color="#ffffff" transmission={0.9} roughness={0.05} thickness={0.2} transparent opacity={0.35} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.72, 40]} />
        <meshStandardMaterial ref={mat} color={P.water} transparent opacity={0.8} roughness={0.2} />
      </mesh>
      {PROBES.map(({ ind, x }) => {
        const st = evals[ind].status;
        const c = st === "device" ? P.device : statusHex(st) ?? P.dark;
        return (
          <group key={ind}>
            <mesh position={[x, 1.25, 0]}>
              <cylinderGeometry args={[0.035, 0.035, 0.9, 12]} />
              <meshStandardMaterial color={c} emissive={statusHex(st) ?? "#000"} emissiveIntensity={statusHex(st) ? 0.6 : 0} />
            </mesh>
            <Line
              points={(() => {
                const w = moduleWorld(ind, 0.1);
                const end: [number, number, number] = [w[0] - 0.6, w[1], w[2] + 0.6];
                return [[x, 1.7, 0], [x, 2.1, 0.4], [(x + end[0]) / 2, 1.6, (end[2]) / 2 + 0.3], end];
              })()}
              color={["#ef4444", "#facc15", "#3b82f6", "#22c55e"][PROBES.findIndex((p) => p.ind === ind)]!}
              lineWidth={1.6}
            />
          </group>
        );
      })}
    </group>
  );
}

function Pin({ ind }: { ind: Indicator }) {
  const v = useSim((s) => s.latest?.[ind]);
  const ev = useSim((s) => s.evals[ind]);
  const select = useSim((s) => s.select);
  const offline = useSim((s) => s.overall === "nodata");
  const tone = offline ? "nodata" : ev.status;
  return (
    <div ref={(el) => { pinEls[ind] = el; }} className="absolute left-0 top-0 z-10" style={{ willChange: "transform" }}>
      <button
        onClick={() => select(ind)}
        className="group flex items-center gap-2 whitespace-nowrap"
        aria-label={`${LABEL[ind]} details`}
      >
        <span className="relative grid size-5 place-items-center rounded-full border-2 border-foreground bg-background">
          <span className={`size-1.5 rounded-full st-bg-${tone}`} />
        </span>
        <span className={`panel px-2 py-1 font-num text-[11px] st-ring-${tone}`}>
          {LABEL[ind]} {v ?? "—"} {UNIT[ind]}
        </span>
      </button>
      {(tone === "concern" || tone === "strong" || tone === "device") && (
        <div className={`absolute -top-9 left-0 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider st-tag-${tone}`}>
          {tone === "device" ? "🔧 Check device" : `⚠ ${ev.reason}`}
        </div>
      )}
    </div>
  );
}

const off = (a: [number, number, number], d: [number, number, number]): [number, number, number] => [a[0] + d[0], a[1] + d[1], a[2] + d[2]];
const PIN_POS: Record<Indicator, [number, number, number]> = {
  ph: off(moduleWorld("ph"), [-0.7, 1.1, 0.4]),
  turbidity_ntu: off(moduleWorld("turbidity_ntu"), [0.4, 1.5, -0.7]),
  tds_mgl: off(moduleWorld("tds_mgl"), [-0.8, 0.2, 1.0]),
  temp_c: off(moduleWorld("temp_c"), [0.2, 0.1, 1.1]),
};
const pinEls: Partial<Record<Indicator, HTMLDivElement | null>> = {};

function Projector() {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    (Object.keys(PIN_POS) as Indicator[]).forEach((k) => {
      const el = pinEls[k];
      if (!el) return;
      v.set(...PIN_POS[k]).project(camera);
      const x = ((v.x + 1) / 2) * size.width - 10;
      const y = ((1 - v.y) / 2) * size.height - 10;
      el.style.transform = `translate(${x}px, ${y}px)`;
    });
  });
  return null;
}

function Packets() {
  const burst = useSim((s) => s.packetBurst);
  const buffered = useSim((s) => s.buffer.length);
  const curve = useMemo(
    () => new THREE.CurvePath<THREE.Vector3>(),
    [],
  );
  useMemo(() => {
    const all = [...PATH, ...PATH2.slice(1)];
    for (let i = 0; i < all.length - 1; i++)
      curve.add(new THREE.LineCurve3(new THREE.Vector3(...all[i]!), new THREE.Vector3(...all[i + 1]!)));
  }, [curve]);
  const live = useRef<{ t: number; delay: number }[]>([]);
  const prev = useRef(burst);
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    const n = burst - prev.current;
    prev.current = burst;
    for (let i = 0; i < Math.min(n, 20); i++) live.current.push({ t: 0, delay: i * 0.12 });
  }, [burst]);
  useFrame((_, dRaw) => {
    const d = Math.min(dRaw, 0.05);
    live.current = live.current.filter((p) => p.t < 1);
    live.current.forEach((p) => {
      if (p.delay > 0) p.delay -= d;
      else p.t += d * 0.6;
    });
    const g = group.current;
    if (!g) return;
    g.children.forEach((m, i) => {
      const p = live.current[i];
      m.visible = !!p && p.delay <= 0;
      if (p && p.delay <= 0) m.position.copy(curve.getPointAt(Math.min(p.t, 1)));
    });
  });
  return (
    <>
      <group ref={group}>
        {Array.from({ length: 20 }).map((_, i) => (
          <mesh key={i} visible={false}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshBasicMaterial color={P.glow} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* queued packets at the device */}
      {Array.from({ length: Math.min(buffered, 12) }).map((_, i) => (
        <mesh key={i} position={[ESP_ANTENNA[0] - 0.4 + (i % 6) * 0.15, 0.75 + Math.floor(i / 6) * 0.15, ESP_ANTENNA[2]]}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshBasicMaterial color={P.amber} toneMapped={false} />
        </mesh>
      ))}
      {buffered > 0 && (
        <Html position={[ESP_ANTENNA[0], 1.3, ESP_ANTENNA[2]]} center>
          <div className="panel whitespace-nowrap px-2 py-1 font-num text-[11px] text-st-concern">{buffered} buffered</div>
        </Html>
      )}
    </>
  );
}

function CloudAndPhone() {
  const sendLed = useSim((s) => s.sendLed);
  return (
    <>
      <group position={CLOUD}>
        <RoundedBox args={[1.2, 0.5, 1.2]} radius={0.08} position={[0, -0.95, 0]}>
          <meshStandardMaterial color={P.body} />
        </RoundedBox>
        {([[-0.25, 0, 0, 0.3], [0.15, 0.1, 0, 0.36], [0.4, -0.05, 0, 0.24]] as const).map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y + 0.2, z]}>
            <sphereGeometry args={[r, 24, 24]} />
            <meshStandardMaterial color={sendLed === "offline" ? "#8a8f95" : "#f2f4f6"} roughness={0.7} />
          </mesh>
        ))}
      </group>
      <group position={[3.2, 0.32, 0.3]} rotation={[-Math.PI / 2.4, 0, 0]}>
        <RoundedBox args={[0.45, 0.85, 0.05]} radius={0.04}>
          <meshStandardMaterial color={P.dark} />
        </RoundedBox>
        <mesh position={[0, 0, 0.03]}>
          <planeGeometry args={[0.38, 0.72]} />
          <meshBasicMaterial color={P.glow} toneMapped={false} transparent opacity={0.7} />
        </mesh>
      </group>
    </>
  );
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
  const turbSt = useSim((s) => s.evals.turbidity_ntu.status);
  const tdsSt = useSim((s) => s.evals.tds_mgl.status);
  const tankStatus = turbSt === "strong" || turbSt === "concern" ? turbSt : tdsSt === "concern" || tdsSt === "strong" ? tdsSt : null;
  return (
    <div className="absolute inset-0 overflow-hidden" data-scene-ready={ready ? "true" : undefined}>
      <Canvas shadows dpr={[1, 2]}>
        <OrthographicCamera makeDefault position={[9, 8, 9]} zoom={78} near={-50} far={100} onUpdate={(c) => c.lookAt(0.4, 1.6, 0.6)} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 10, 4]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <Environment resolution={64}>
          <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} />
          <Lightformer intensity={1} color="#9fe" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        </Environment>

        {/* base slab */}
        <RoundedBox args={[7.4, 0.3, 6.6]} radius={0.06} position={[0.2, -0.15, 0.4]} receiveShadow>
          <meshStandardMaterial color={P.slab} roughness={0.9} />
        </RoundedBox>
        <mesh position={[0.2, -0.32, 0.4]}>
          <boxGeometry args={[7.6, 0.06, 6.8]} />
          <meshStandardMaterial color={P.slabEdge} />
        </mesh>

        <Tank status={tankStatus} />
        <Pipe points={[[-2, 2.1, -1], [-2, 1.1, -1], [-0.5, 1.1, -0.6], [0.15, 1.1, -0.6]]} />
        <Pipe points={[[0.6, 0.35, -0.6], [0.6, 0.1, 0.6], [-1.2, 0.1, 1.8]]} color={P.dark} r={0.06} />
        <FlowCell />
        <SensorBoard />
        <CloudAndPhone />

        <Line points={PATH} color={P.glow} lineWidth={1.5} transparent opacity={0.7} />
        <Line points={PATH2} color={P.glow} lineWidth={1.5} transparent opacity={0.7} dashed dashSize={0.1} gapSize={0.08} />
        <Packets />

        <Projector />
        <Ready onReady={() => setReady(true)} />
      </Canvas>
      {(Object.keys(PIN_POS) as Indicator[]).map((k) => (
        <Pin key={k} ind={k} />
      ))}
    </div>
  );
}
