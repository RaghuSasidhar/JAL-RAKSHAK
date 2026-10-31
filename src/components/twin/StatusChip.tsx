import { AlertOctagon, AlertTriangle, CheckCircle2, Hourglass, WifiOff, Wrench } from "lucide-react";
import { STATUS_META, type Status } from "@/detection";

const ICON = {
  normal: CheckCircle2,
  concern: AlertTriangle,
  strong: AlertOctagon,
  device: Wrench,
  nodata: WifiOff,
  learning: Hourglass,
} as const;

export function StatusChip({ status, size = "sm" }: { status: Status; size?: "sm" | "lg" }) {
  const Icon = ICON[status];
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium st-text-${status} ${size === "lg" ? "text-base" : "text-xs"}`}>
      <Icon className={size === "lg" ? "size-5" : "size-3.5"} />
      {STATUS_META[status].word}
    </span>
  );
}
