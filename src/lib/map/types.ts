export type NodeKind = "thought" | "plan" | "action";

export const NODE_KINDS: readonly NodeKind[] = ["thought", "plan", "action"];

export const KIND_LABEL: Record<NodeKind, string> = {
  thought: "思考",
  plan: "計画",
  action: "行動",
};

// マップは「親IDを持つノードの配列」だけで表現する。
// エッジを別に持つと、ノード削除時にエッジだけ残るなど不整合の余地が生まれるため、
// 木構造であることを型レベルで保証できるこの形にした。
export type MapNode = {
  id: string;
  label: string;
  kind: NodeKind;
  parentId: string | null;
};

export type MindMap = { nodes: MapNode[] };

// 思考 → 計画 → 行動 の流れを崩さないためのルール。
// 同種の子（思考の下の思考など）は「分解」として許し、逆流（行動の下に思考）は許さない。
export const ALLOWED_CHILD_KINDS: Record<NodeKind, readonly NodeKind[]> = {
  thought: ["thought", "plan"],
  plan: ["plan", "action"],
  action: [],
};

export type AddOp = {
  op: "add";
  id: string; // AIが付ける仮ID。反映時に本物のIDへ振り替える
  parentId: string;
  label: string;
  kind: NodeKind;
  reason: string;
};
export type UpdateOp = {
  op: "update";
  id: string;
  label?: string;
  kind?: NodeKind;
  reason: string;
};
export type DeleteOp = { op: "delete"; id: string; reason: string };
export type Operation = AddOp | UpdateOp | DeleteOp;

export type Proposal = { summary: string; operations: Operation[] };

export type AiMode = "ask" | "edit" | "agent";
