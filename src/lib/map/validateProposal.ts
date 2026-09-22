import { step } from "./applyProposal";
import { LIMITS } from "./schema";
import type { AiMode, MindMap, Proposal } from "./types";

/**
 * AIの提案をマップに当てる前に機械的にチェックする。
 * LLMは「それっぽいが存在しないID」や「行動の下に思考」を普通に返してくるので、
 * プロンプトでお願いするだけでなく、プログラム側で必ず弾く（ここで見つかった誤りはグラフの差し戻しに使う）。
 */
export function validateProposal(
  map: MindMap,
  proposal: Proposal,
  opts: { mode: AiMode; selectedId: string | null },
): string[] {
  const errors: string[] = [];
  const ops = proposal.operations;

  if (ops.length === 0) errors.push("operations が空です。少なくとも1つ変更を提案してください");
  if (ops.length > LIMITS.maxOperations)
    errors.push(`操作が多すぎます（最大${LIMITS.maxOperations}件）`);

  // Edit は「選択中のノードとその直下」だけを触るモード。
  // 範囲を狭くしておくと、ユーザーが差分を一目で確認でき、承認の判断が軽くなる。
  if (opts.mode === "edit") {
    for (const op of ops) {
      if (op.op === "delete") errors.push("Editモードでは削除はできません");
      if (op.op === "update" && op.id !== opts.selectedId)
        errors.push(`Editモードでは選択中のノード（${opts.selectedId}）以外は変更できません`);
      if (op.op === "add" && op.parentId !== opts.selectedId)
        errors.push(`Editモードでは選択中のノード（${opts.selectedId}）の直下にだけ追加できます`);
    }
  }

  // 全操作を順番に仮適用し、各ステップのルール違反を集める（反映時と同じ step を使う）
  const ctx = { idMap: new Map<string, string>(), newId: (t: string) => `__preview_${t}` };
  let nodes = map.nodes;
  for (const op of ops) {
    const r = step(nodes, op, ctx);
    if (r.ok) nodes = r.nodes;
    else errors.push(r.error);
  }
  if (nodes.length > LIMITS.maxNodes) errors.push(`ノード数が上限（${LIMITS.maxNodes}）を超えます`);

  return [...new Set(errors)];
}
