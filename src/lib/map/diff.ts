import { descendantIds } from "./applyProposal";
import type { MapNode, MindMap, NodeKind, Operation } from "./types";

export type DiffStatus = "unchanged" | "added" | "updated" | "deleted";

export type PreviewNode = MapNode & {
  status: DiffStatus;
  opIndex?: number;
  accepted?: boolean;
  before?: { label: string; kind: NodeKind };
};

/**
 * 提案を「反映した後の姿」ではなく「何がどう変わるか」が見える形に重ねる。
 * 削除予定のノードも消さずに残して赤く見せるのは、承認前に失われるものを必ず目に入れてもらうため。
 */
export function buildPreview(
  map: MindMap,
  operations: Operation[],
  accepted: (index: number) => boolean = () => true,
): PreviewNode[] {
  let nodes: PreviewNode[] = map.nodes.map((n) => ({ ...n, status: "unchanged" }));
  const idMap = new Map<string, string>();
  const resolve = (id: string) => idMap.get(id) ?? id;

  operations.forEach((op, opIndex) => {
    const isAccepted = accepted(opIndex);
    if (op.op === "add") {
      const parentId = resolve(op.parentId);
      if (!nodes.some((n) => n.id === parentId)) return;
      const id = `preview:${op.id}`;
      idMap.set(op.id, id);
      nodes.push({ id, parentId, label: op.label, kind: op.kind, status: "added", opIndex, accepted: isAccepted });
      return;
    }
    const targetId = resolve(op.id);
    if (op.op === "update") {
      nodes = nodes.map((n) =>
        n.id === targetId
          ? {
              ...n,
              status: n.status === "added" ? "added" : "updated",
              before: n.before ?? { label: n.label, kind: n.kind },
              label: op.label ?? n.label,
              kind: op.kind ?? n.kind,
              opIndex,
              accepted: isAccepted,
            }
          : n,
      );
      return;
    }
    const removed = descendantIds(nodes, targetId);
    nodes = nodes.map((n) => (removed.has(n.id) ? { ...n, status: "deleted", opIndex, accepted: isAccepted } : n));
  });

  return nodes;
}
