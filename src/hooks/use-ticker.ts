import { useEffect } from "react";
import { useSim } from "@/store/sim";
import { INTERVAL_S } from "@/simulator/engine";

/** Drives the simulation clock; mount once per visible page. */
export function useTicker() {
  const init = useSim((s) => s.init);
  const tick = useSim((s) => s.tick);
  const speed = useSim((s) => s.speed);
  useEffect(() => init(), [init]);
  useEffect(() => {
    const id = setInterval(tick, (INTERVAL_S * 1000) / speed);
    return () => clearInterval(id);
  }, [tick, speed]);
}
