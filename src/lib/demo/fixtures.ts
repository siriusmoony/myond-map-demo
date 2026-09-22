import type { GraphOutput } from "../agent/graph";
import { ALLOWED_CHILD_KINDS, KIND_LABEL, type AiMode, type MindMap, type Operation } from "../map/types";
import { validateProposal } from "../map/validateProposal";

/**
 * APIキーなしで一連の体験（Ask → Edit → Agent → 差分 → 承認）を見せるための固定応答。
 * 本物と同じ GraphOutput 型で返すので、画面側は「本物かデモか」を意識せずに同じ処理を通る。
 * これにより、デモで見せている差分プレビュー・承認・反映のコードは本番とまったく同じものになる。
 */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function askAnswer(map: MindMap, selectedId: string | null): string {
  const node = map.nodes.find((n) => n.id === selectedId);
  if (!node) {
    return "マップ全体を見ると、「思考」は十分に出ていますが「行動」がまだ1つだけです。まずは「平日は時間が少ない」という制約に対する計画を1つ立て、今週できる小さな行動に落とし込むと前に進みやすくなります。（デモモードの固定応答です）";
  }
  const next = { thought: "計画", plan: "行動", action: "実行と振り返り" }[node.kind];
  return `「${node.label}」は${KIND_LABEL[node.kind]}ノードです。次の一歩は、これを具体的な「${next}」に落とし込むことです。Editモードで子ノードを提案させてみてください。（デモモードの固定応答です）`;
}

// Edit は選択ノードに合わせて組み立てる。サンプル以外のマップでもデモが破綻しないようにするため。
function editOperations(map: MindMap, selectedId: string): Operation[] {
  const node = map.nodes.find((n) => n.id === selectedId);
  if (!node) return [];
  const childKind = ALLOWED_CHILD_KINDS[node.kind].at(-1);
  if (!childKind) {
    return [{ op: "update", id: node.id, label: `${node.label.slice(0, 30)}（今週中）`, reason: "期限を入れると行動に移しやすくなるため" }];
  }
  const ideas =
    childKind === "plan"
      ? ["小さく試す計画を立てる", "必要な時間とお金を見積もる"]
      : ["15分でできる最初の一歩をやる", "結果をメモして振り返る"];
  return [
    node.kind === "thought"
      ? { op: "update", id: node.id, label: `${node.label.slice(0, 30)}（優先度：高）`, reason: "どの思考から手を付けるかを明確にするため" }
      : { op: "update", id: node.id, label: `${node.label.slice(0, 30)}（今月中）`, reason: "期限を入れると行動の粒度を決めやすくなるため" },
    ...ideas.map((label, i): Operation => ({
      op: "add",
      id: `new_${i + 1}`,
      parentId: node.id,
      label,
      kind: childKind,
      reason: `${KIND_LABEL[node.kind]}を${KIND_LABEL[childKind]}に落とし込むため`,
    })),
  ];
}

// Agent はサンプルマップ用に作り込んだシナリオ。「思考から計画・行動へ展開」＋「重複の削除」＋「改名」を1回で見せる。
const AGENT_OPERATIONS: Operation[] = [
  { op: "add", id: "new_1", parentId: "t3", label: "朝の30分を副業時間に固定する", kind: "plan", reason: "「時間が少ない」という制約を計画で解消するため" },
  { op: "add", id: "new_2", parentId: "new_1", label: "今週は平日3日、6:30に起きる", kind: "action", reason: "計画を今週実行できる行動に落とすため" },
  { op: "add", id: "new_3", parentId: "p1", label: "クラウドソーシングに登録する", kind: "action", reason: "案件獲得の入口を作るため" },
  { op: "update", id: "a1", label: "得意分野のポートフォリオ記事を1本書く", reason: "「得意なこと」とのつながりを明確にするため" },
  { op: "delete", id: "t4", reason: "ルートの思考「月5万円の収入」と内容が重複しているため" },
];

export async function demoRespond(
  mode: AiMode,
  map: MindMap,
  selectedId: string | null,
): Promise<GraphOutput> {
  await wait(700); // 本物の応答待ちに近い間を作り、ローディング表示も確認できるようにする

  if (mode === "ask") return { kind: "answer", answer: askAnswer(map, selectedId), trace: ["START", "ask", "END"] };

  if (mode === "edit") {
    if (!selectedId) return { kind: "error", errors: ["Editモードではノードを1つ選択してください"], attempts: 0, trace: ["START", "edit (未選択のため中止)", "validate: NG（1件）", "END"] };
    const proposal = { summary: "選択したノードを明確にし、次の段階の子ノードを追加する提案です。（デモ）", operations: editOperations(map, selectedId) };
    return { kind: "proposal", proposal, attempts: 1, trace: ["START", "edit", "validate: OK", "END"] };
  }

  const proposal = {
    summary: "「時間が少ない」から計画と行動を展開し、重複した思考を整理する提案です。（デモ）",
    operations: AGENT_OPERATIONS,
  };
  // ユーザーがマップを編集してシナリオの前提が崩れていたら、本物と同じ検証で止める
  const errors = validateProposal(map, proposal, { mode, selectedId });
  if (errors.length) {
    return { kind: "error", errors: ["デモ用の応答はサンプルマップ向けです。「サンプルに戻す」を押してから試してください", ...errors], attempts: 1, trace: ["START", "agent", `validate: NG（${errors.length}件）`, "END"] };
  }
  // 差し戻しループが存在することを見せるため、デモでは「1回目はNG → 作り直してOK」の経路を再生する
  return { kind: "proposal", proposal, attempts: 2, trace: ["START", "agent", "validate: NG（1件）", "agent", "validate: OK", "END"] };
}
