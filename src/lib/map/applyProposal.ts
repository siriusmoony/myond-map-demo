import { LIMITS } from "./schema";
import {
  ALLOWED_CHILD_KINDS,
  KIND_LABEL,
  type MapNode,
  type MindMap,
  type Operation,
} from "./types";

type StepContext = {
  // AIの仮ID → 実際に振ったID。後続の add が仮IDを親に指定できるようにするため
  idMap: Map<string, string>;
  newId: (tempId: string) => string;
};

type StepResult = { ok: true; nodes: MapNode[] } | { ok: false; error: string };

export function descendantIds(nodes: MapNode[], rootId: string): Set<string> {
  const result = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (n.parentId && result.has(n.parentId) && !result.has(n.id)) {
        result.add(n.id);
        grew = true;
      }
    }
  }
  return result;
}

/**
 * 1操作ぶんだけマップを進める。
 * 検証（validateProposal）と反映（applyProposal）の両方がこの関数を通る。
 * 「検証ではOKだったのに反映すると壊れる」というズレを構造的に起こさないため、ルールをここ1か所に集めた。
 */
export function step(nodes: MapNode[], op: Operation, ctx: StepContext): StepResult {
  const resolve = (id: string) => ctx.idMap.get(id) ?? id;
  const find = (id: string) => nodes.find((n) => n.id === resolve(id));

  if (op.op === "add") {
    const parent = find(op.parentId);
    if (!parent) return { ok: false, error: `add「${op.label}」: 親ノード ${op.parentId} が存在しません` };
    const label = op.label.trim();
    if (!label) return { ok: false, error: `add: ラベルが空です` };
    if (label.length > LIMITS.maxLabel)
      return { ok: false, error: `add「${label}」: ラベルは${LIMITS.maxLabel}文字以内にしてください` };
    if (nodes.some((n) => n.id === op.id) || ctx.idMap.has(op.id))
      return { ok: false, error: `add「${label}」: 仮ID ${op.id} が既存IDと重複しています` };
    if (!ALLOWED_CHILD_KINDS[parent.kind].includes(op.kind))
      return {
        ok: false,
        error: `add「${label}」: ${KIND_LABEL[parent.kind]}ノードの下に${KIND_LABEL[op.kind]}ノードは置けません（思考→計画→行動の順）`,
      };
    const id = ctx.newId(op.id);
    ctx.idMap.set(op.id, id);
    return { ok: true, nodes: [...nodes, { id, label, kind: op.kind, parentId: parent.id }] };
  }

  const target = find(op.id);
  if (!target) return { ok: false, error: `${op.op}: ノード ${op.id} が存在しません` };

  if (op.op === "update") {
    const label = op.label?.trim();
    if (op.label !== undefined && !label) return { ok: false, error: `update ${op.id}: ラベルが空です` };
    if (label && label.length > LIMITS.maxLabel)
      return { ok: false, error: `update ${op.id}: ラベルは${LIMITS.maxLabel}文字以内にしてください` };
    if (op.kind && op.kind !== target.kind) {
      const parent = target.parentId ? nodes.find((n) => n.id === target.parentId) : undefined;
      if (parent && !ALLOWED_CHILD_KINDS[parent.kind].includes(op.kind))
        return { ok: false, error: `update「${target.label}」: 親が${KIND_LABEL[parent.kind]}なので${KIND_LABEL[op.kind]}にはできません` };
      const badChild = nodes.find(
        (n) => n.parentId === target.id && !ALLOWED_CHILD_KINDS[op.kind!].includes(n.kind),
      );
      if (badChild)
        return { ok: false, error: `update「${target.label}」: 子「${badChild.label}」と種類が合わなくなります` };
    }
    return {
      ok: true,
      nodes: nodes.map((n) =>
        n.id === target.id ? { ...n, label: label ?? n.label, kind: op.kind ?? n.kind } : n,
      ),
    };
  }

  // delete
  if (target.parentId === null) return { ok: false, error: `delete: ルートノード「${target.label}」は削除できません` };
  const removed = descendantIds(nodes, target.id);
  return { ok: true, nodes: nodes.filter((n) => !removed.has(n.id)) };
}

let counter = 0;
const defaultNewId = () => `n_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export type ApplyResult = { map: MindMap; applied: number[]; skipped: { index: number; error: string }[] };

/**
 * 人が承認した操作だけをマップに反映する。
 * 一部だけ承認されると「承認されなかった add の子を add する操作」のように前提が崩れるものが出るが、
 * それはエラーにせずスキップして理由を返す。承認済みの他の変更まで巻き込んで失敗させないため。
 */
export function applyProposal(
  map: MindMap,
  operations: Operation[],
  accepted: (index: number) => boolean = () => true,
  newId: (tempId: string) => string = defaultNewId,
): ApplyResult {
  const ctx: StepContext = { idMap: new Map(), newId };
  let nodes = map.nodes;
  const applied: number[] = [];
  const skipped: ApplyResult["skipped"] = [];
  operations.forEach((op, index) => {
    if (!accepted(index)) return;
    const r = step(nodes, op, ctx);
    if (r.ok) {
      nodes = r.nodes;
      applied.push(index);
    } else {
      skipped.push({ index, error: r.error });
    }
  });
  return { map: { nodes }, applied, skipped };
}
