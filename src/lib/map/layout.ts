import dagre from "@dagrejs/dagre";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 64;
// 変更プレビューでは旧ラベルも表示して背が高くなるので、配置は余裕を持った高さで計算する
export const LAYOUT_HEIGHT = 88;

/**
 * 座標をデータに保存せず、毎回ツリーから自動で並べ直す。
 * AIがノードを足すたびに「どこに置くか」まで考えさせると出力が複雑になり失敗が増えるので、
 * 位置はプログラムの責任にして、AIには意味（何を・どこの下に）だけを決めてもらう。
 * 左→右に流すのは、思考→計画→行動という時間の流れと読む方向を揃えるため。
 */
export function layoutTree<T extends { id: string; parentId: string | null }>(
  nodes: T[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: LAYOUT_HEIGHT });
  for (const n of nodes) if (n.parentId && ids.has(n.parentId)) g.setEdge(n.parentId, n.id);
  dagre.layout(g);
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const p = g.node(n.id);
    pos.set(n.id, { x: p.x - NODE_WIDTH / 2, y: p.y - LAYOUT_HEIGHT / 2 });
  }
  return pos;
}
