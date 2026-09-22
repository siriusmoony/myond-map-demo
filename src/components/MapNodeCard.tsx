"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import type { PreviewNode } from "@/lib/map/diff";
import { KIND_LABEL } from "@/lib/map/types";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/map/layout";
import { KIND_STYLE } from "./kindStyles";

export type MapNodeData = PreviewNode & { selected: boolean; previewing: boolean };
export type MapFlowNode = Node<MapNodeData, "mapNode">;

const STATUS_RING: Record<PreviewNode["status"], string> = {
  unchanged: "",
  added: "outline-2 outline-dashed outline-emerald-500 outline-offset-2",
  updated: "outline-2 outline-amber-400 outline-offset-2",
  deleted: "outline-2 outline-red-400 outline-offset-2 opacity-60",
};

const STATUS_BADGE: Partial<Record<PreviewNode["status"], [string, string]>> = {
  added: ["追加", "bg-emerald-600"],
  updated: ["変更", "bg-amber-500"],
  deleted: ["削除", "bg-red-500"],
};

function MapNodeCardImpl({ data }: NodeProps<MapFlowNode>) {
  const style = KIND_STYLE[data.kind];
  const badge = STATUS_BADGE[data.status];
  // 承認リストでチェックを外した操作は薄く表示し、「反映されるもの」と「されないもの」を見分けられるようにする
  const dimmed = data.status !== "unchanged" && data.accepted === false;

  return (
    <div
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      className={`relative rounded-xl border-2 px-3 py-2 shadow-sm transition ${style.card} ${STATUS_RING[data.status]} ${
        data.selected ? "ring-2 ring-slate-900 ring-offset-2" : ""
      } ${dimmed ? "opacity-35" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />
      <div className="flex items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.chip}`}>{KIND_LABEL[data.kind]}</span>
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${badge[1]}`}>{badge[0]}</span>
        )}
      </div>
      {data.status === "updated" && data.before && data.before.label !== data.label && (
        <div className="mt-1 text-[11px] leading-tight text-slate-500 line-through">{data.before.label}</div>
      )}
      <div className={`mt-1 text-[13px] leading-snug text-slate-900 ${data.status === "deleted" ? "line-through" : ""}`}>
        {data.label}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-slate-400" />
    </div>
  );
}

export const MapNodeCard = memo(MapNodeCardImpl);
