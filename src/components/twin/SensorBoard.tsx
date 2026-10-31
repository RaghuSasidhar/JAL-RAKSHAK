import { Line, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useSim } from "@/store/sim";
import type { Indicator } from "@/simulator/types";
import type { Status } from "@/detection";

/** Board centre in world space. Modules are laid out in local coords on top of it. */
export const BOARD_POS: [number, number, number] = [0.9, 0.25, 1.6];
const TOP = 0.06;

// Colour per board part (real-world module colours).
const C = {
  pcb: "#1d6b45",
  trace: "#d4a94c",
  esp: "#16181b",
  shield: "#c7ccd1",
  ph: "#2563eb",
  turb: "#1f2937",
  turbTerm: "#eab308",
  tds: "#0d9488",
  temp: "#dc2626",
  oled: "#0b0d10",
  screen: "#2dd4bf",
  buck: "#f97316",
  header: "#0f1113",
  pinGold: "#e5c26a",
  cap: "#1e3a8a",
};

export const MODULES: Record<Indicator, { pos: [number, number, number]; size: [number, number]; color: string; name: string }> = {
  ph: { pos: [-1.1, 0, -0.42], size: [0.75, 0.55], color: C.ph, name: "pH" },
  turbidity_ntu: { pos: [-0.25, 0, -0.42], size: [0.7, 0.55], color: C.turb, name: "Turbidity" },
  tds_mgl: { pos: [-1.1, 0, 0.42], size: [0.75, 0.5], color: C.tds, name: "TDS" },
  temp_c: { pos: [-0.25, 0, 0.42], size: [0.55, 0.45], color: C.temp, name: "Temp" },
};

/** World position just above a module (for callout pins and probe cables). */
export function moduleWorld(ind: Indicator, lift = 0): [number, number, number] {
  const m = MODULES[ind].pos;
  return [BOARD_POS[0] + m[0], BOARD_POS[1] + TOP + 0.1 + lift, BOARD_POS[2] + m[2]];
}
export const ESP_ANTENNA: [number, number, number] = [BOARD_POS[0] + 1.25, BOARD_POS[1] + 0.2, BOARD_POS[2] - 0.45];

const flagHex = (s: Status) => (s === "strong" ? "#ef4444" : s === "concern" ? "#f59e0b" : s === "device" ? "#7c93b0" : null);

function Headers({ x, z, n, along = "x" }: { x: number; z: number; n: number; along?: "x" | "z" }) {
  return (
    <group position={[x, TOP, z]}>
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={along === "x" ? [n * 0.08, 0.08, 0.08] : [0.08, 0.08, n * 0.08]} />
        <meshStandardMaterial color={C.header} />
      </mesh>
      {Array.from({ length: n }).map((_, i) => {
        const o = (i - (n - 1) / 2) * 0.08;
        return (
          <mesh key={i} position={along === "x" ? [o, 0.12, 0] : [0, 0.12, o]}>
            <boxGeometry args={[0.02, 0.1, 0.02]} />
            <meshStandardMaterial color={C.pinGold} metalness={0.8} roughness={0.3} />
          </mesh>
        );
      })}
    </group>
  );
}

function Module({ ind }: { ind: Indicator }) {
  const m = MODULES[ind];
  const st = useSim((s) => (s.overall === "nodata" ? "nodata" : s.evals[ind].status));
  const select = useSim((s) => s.select);
  const flag = flagHex(st);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.opacity = 0.25 + Math.sin(clock.elapsedTime * 3) * 0.1;
  });
  const [w, d] = m.size;
  return (
    <group position={[m.pos[0], TOP, m.pos[2]]} onClick={() => select(ind)}>
      {/* standoffs + module PCB */}
      <RoundedBox args={[w, 0.05, d]} radius={0.015} position={[0, 0.1, 0]} castShadow>
        <meshStandardMaterial
          color={st === "device" ? "#7c93b0" : m.color}
          emissive={flag ?? "#000"}
          emissiveIntensity={flag ? 0.35 : 0}
          roughness={0.5}
        />
      </RoundedBox>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[(sx! * w) / 2.4, 0.04, (sz! * d) / 2.4]}>
          <cylinderGeometry args={[0.02, 0.02, 0.08, 8]} />
          <meshStandardMaterial color={C.shield} metalness={0.7} />
        </mesh>
      ))}
      {/* chip */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[w * 0.32, 0.04, d * 0.32]} />
        <meshStandardMaterial color="#0b0b0c" roughness={0.3} />
      </mesh>
      {ind === "ph" && (
        <>
          <mesh position={[-w / 2 + 0.1, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.08, 0.08, 0.18, 20]} />
            <meshStandardMaterial color={C.pinGold} metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[w / 4, 0.17, -d / 4]}>
            <boxGeometry args={[0.1, 0.07, 0.1]} />
            <meshStandardMaterial color="#60a5fa" />
          </mesh>
        </>
      )}
      {ind === "turbidity_ntu" && (
        <mesh position={[-w / 2 + 0.12, 0.18, 0]}>
          <boxGeometry args={[0.16, 0.12, 0.3]} />
          <meshStandardMaterial color={C.turbTerm} />
        </mesh>
      )}
      {ind === "tds_mgl" && (
        <mesh position={[-w / 2 + 0.1, 0.17, 0]}>
          <boxGeometry args={[0.12, 0.09, 0.22]} />
          <meshStandardMaterial color="#f5f5f4" />
        </mesh>
      )}
      {ind === "temp_c" && (
        <mesh position={[-w / 2 + 0.1, 0.18, 0]}>
          <boxGeometry args={[0.14, 0.12, 0.24]} />
          <meshStandardMaterial color="#22c55e" />
        </mesh>
      )}
      <Headers x={w / 2 - 0.08} z={0} n={4} along="z" />
      {/* warning column, like the reference's highlighted building */}
      {flag && (
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[w + 0.06, 0.9, d + 0.06]} />
          <meshBasicMaterial ref={glow} color={flag} transparent opacity={0.3} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function Esp32() {
  const led = useSim((s) => s.sendLed);
  const ledColor = led === "sent" ? "#22c55e" : led === "buffering" ? "#f59e0b" : "#6b7280";
  return (
    <group position={[0.95, TOP, -0.45]}>
      <RoundedBox args={[1.0, 0.06, 0.55]} radius={0.015} position={[0, 0.1, 0]} castShadow>
        <meshStandardMaterial color={C.esp} roughness={0.5} />
      </RoundedBox>
      <mesh position={[-0.05, 0.17, 0]}>
        <boxGeometry args={[0.55, 0.07, 0.42]} />
        <meshStandardMaterial color={C.shield} metalness={0.9} roughness={0.25} />
      </mesh>
      {/* antenna trace */}
      <mesh position={[0.36, 0.14, 0]}>
        <boxGeometry args={[0.16, 0.01, 0.4]} />
        <meshStandardMaterial color={C.trace} metalness={0.6} />
      </mesh>
      <mesh position={[-0.42, 0.15, 0.18]}>
        <sphereGeometry args={[0.03, 12, 12]} />
        <meshBasicMaterial color={ledColor} toneMapped={false} />
      </mesh>
      <Headers x={0} z={-0.3} n={12} />
      <Headers x={0} z={0.3} n={12} />
    </group>
  );
}

function Oled() {
  return (
    <group position={[0.75, TOP, 0.45]}>
      <RoundedBox args={[0.6, 0.05, 0.45]} radius={0.015} position={[0, 0.1, 0]}>
        <meshStandardMaterial color="#1e40af" />
      </RoundedBox>
      <mesh position={[0, 0.14, 0.02]}>
        <boxGeometry args={[0.5, 0.03, 0.3]} />
        <meshStandardMaterial color={C.oled} />
      </mesh>
      <mesh position={[0, 0.156, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.44, 0.24]} />
        <meshBasicMaterial color={C.screen} toneMapped={false} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

function Power() {
  return (
    <group position={[1.35, TOP, 0.45]}>
      <RoundedBox args={[0.35, 0.05, 0.5]} radius={0.015} position={[0, 0.1, 0]}>
        <meshStandardMaterial color={C.buck} />
      </RoundedBox>
      <mesh position={[0, 0.2, -0.1]}>
        <cylinderGeometry args={[0.07, 0.07, 0.16, 16]} />
        <meshStandardMaterial color={C.cap} />
      </mesh>
      <mesh position={[0, 0.17, 0.13]}>
        <boxGeometry args={[0.16, 0.1, 0.12]} />
        <meshStandardMaterial color="#111" />
      </mesh>
    </group>
  );
}

const WIRE_COLORS = ["#ef4444", "#facc15", "#3b82f6", "#22c55e"];

export function SensorBoard() {
  const inds = Object.keys(MODULES) as Indicator[];
  return (
    <group position={BOARD_POS}>
      {/* main PCB */}
      <RoundedBox args={[3.3, 0.08, 1.9]} radius={0.03} castShadow receiveShadow>
        <meshStandardMaterial color={C.pcb} roughness={0.6} />
      </RoundedBox>
      {/* gold traces */}
      {[-0.7, -0.2, 0.2, 0.7].map((z, i) => (
        <mesh key={i} position={[0, 0.045, z]}>
          <boxGeometry args={[3.0, 0.005, 0.02]} />
          <meshStandardMaterial color={C.trace} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {[-1.5, 1.5].map((x) => [-0.8, 0.8].map((z) => (
        <mesh key={`${x}${z}`} position={[x, 0.045, z]}>
          <cylinderGeometry args={[0.05, 0.05, 0.01, 16]} />
          <meshStandardMaterial color={C.trace} metalness={0.8} />
        </mesh>
      )))}
      {inds.map((i) => <Module key={i} ind={i} />)}
      <Esp32 />
      <Oled />
      <Power />
      {/* jumper wires: module headers -> ESP32 headers */}
      {inds.map((ind, i) => {
        const m = MODULES[ind];
        const s: [number, number, number] = [m.pos[0] + m.size[0] / 2 - 0.08, 0.2, m.pos[2]];
        const e: [number, number, number] = [0.5 + i * 0.12, 0.2, -0.75];
        const mid: [number, number, number] = [(s[0] + e[0]) / 2, 0.55, (s[2] + e[2]) / 2];
        return <Line key={ind} points={[s, mid, e]} color={WIRE_COLORS[i]!} lineWidth={2.2} />;
      })}
    </group>
  );
}
