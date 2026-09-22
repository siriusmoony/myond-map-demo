"use client";

import { Background, Controls, ReactFlow, useReactFlow, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";
import type { PreviewNode } from "@/lib/map/diff";
import { layoutTree } from "@/lib/map/layout";
import { MapNodeCard, type MapFlowNode } from "./MapNodeCard";

const nodeTypes = { mapNode: MapNodeCard };
const FIT_OPTIONS = { padding: 0.15, duration: 300, maxZoom: 1.1 };

const EDGE_COLOR: Record<PreviewNode["status"], string> = {
  unchanged: "#94a3b8",
  added: "#10b981",
  updated: "#94a3b8",
  deleted: "#f87171",
};

type Props = {
  nodes: PreviewNode[];
  selectedId: string | null;
  previewing: boolean;
  onSelect: (id: string | null) => void;
};

export function MindMap({ nodes, selectedId, previewing, onSelect }: Props) {
  const { fitView } = useReactFlow();

  const { flowNodes, flowEdges } = useMemo(() => {
    const pos = layoutTree(nodes);
    const flowNodes: MapFlowNode[] = nodes.map((n) => ({
      id: n.id,
      type: "mapNode",
      position: pos.get(n.id)!,
      data: { ...n, selected: n.id === selectedId, previewing },
      // 位置は自動レイアウトが決めるので、ドラッグで動かせても次の更新で戻ってしまう。混乱を避けて固定する
      draggable: false,
    }));
    const flowEdges: Edge[] = nodes
      .filter((n) => n.parentId)
      .map((n) => ({
        id: `${n.parentId}->${n.id}`,
        source: n.parentId!,
        target: n.id,
        type: "smoothstep",
        animated: n.status === "added",
        style: { stroke: EDGE_COLOR[n.status], strokeWidth: 1.5, strokeDasharray: n.status === "added" ? "5 4" : undefined },
      }));
    return { flowNodes, flowEdges };
  }, [nodes, selectedId, previewing]);

  // ノード数が変わったとき（追加・削除・プレビュー開始）だけ全体が収まるように寄せる。
  // 選択のたびに動くと、見ていた場所がずれて落ち着かないため。
  const count = nodes.length;
  useEffect(() => {
    const fit = () => fitView(FIT_OPTIONS);
    // 新しいノードの大きさが測られる前に寄せると空振りすることがあるので、少し間を空けて2回試す
    const timers = [setTimeout(fit, 50), setTimeout(fit, 400)];
    // 画面幅が変わったとき（スマホの回転やパネル幅の変化）も収まり直すようにする
    window.addEventListener("resize", fit);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", fit);
    };
  }, [count, fitView]);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => {
        if (!node.id.startsWith("preview:")) onSelect(node.id === selectedId ? null : node.id);
      }}
      onPaneClick={() => onSelect(null)}
      nodesConnectable={false}
      fitView
      fitViewOptions={FIT_OPTIONS}
      minZoom={0.2}
      proOptions={{ hideAttribution: false }}
    >
      <Background gap={20} color="#e2e8f0" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
