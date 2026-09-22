import { KIND_LABEL, type MapNode, type MindMap } from "../map/types";

/**
 * マップをインデント付きのテキストにして渡す。
 * JSON のまま渡すより親子関係が一目で伝わり、LLM が「どこに何を足すか」を取り違えにくい。
 * ID を必ず併記するのは、提案では ID で対象を指してもらう必要があるから。
 */
export function renderMap(map: MindMap, selectedId: string | null): string {
  const children = (id: string | null) => map.nodes.filter((n) => n.parentId === id);
  const lines: string[] = [];
  const walk = (n: MapNode, depth: number) => {
    const mark = n.id === selectedId ? "  ← 選択中" : "";
    lines.push(`${"  ".repeat(depth)}- [${n.id}] (${KIND_LABEL[n.kind]}) ${n.label}${mark}`);
    children(n.id).forEach((c) => walk(c, depth + 1));
  };
  children(null).forEach((r) => walk(r, 0));
  return lines.join("\n");
}

const BASE = `あなたは「思考・計画・行動」をマップで整理するアプリのAIアシスタントです。
ノードの種類:
- 思考(thought): 願い・悩み・気づき・背景
- 計画(plan): 思考を実現するための方針や中間目標
- 行動(action): 今日〜今週に実行できる具体的で小さなタスク（動詞で終える）
構造ルール: 思考の子は思考か計画、計画の子は計画か行動、行動の子は置けない。ルートは削除できない。
ラベルは40文字以内の簡潔な日本語にしてください。`;

export function askPrompt(mapText: string, selectedLabel: string | null, question: string): [string, string][] {
  return [
    ["system", `${BASE}\nあなたはユーザーの質問に答えるだけで、マップは変更しません。マップの内容を踏まえて具体的に答えてください。`],
    ["human", `現在のマップ:\n${mapText}\n\n${selectedLabel ? `選択中のノード: 「${selectedLabel}」\n` : ""}質問: ${question}`],
  ];
}

// 差し戻し時は「前回の提案」と「何がダメだったか」を具体的に見せる。
// 同じ間違いを繰り返させないためには、ルールを再度説くより実際のエラー文を渡す方が効く。
function retryNote(errors: string[], previous: unknown): string {
  if (errors.length === 0) return "";
  return `\n\n前回の提案はプログラムの検証で却下されました。以下を直して、提案全体を出し直してください:\n${errors
    .map((e) => `- ${e}`)
    .join("\n")}\n前回の提案: ${JSON.stringify(previous)}`;
}

export function editPrompt(
  mapText: string,
  selected: MapNode,
  instruction: string,
  errors: string[],
  previous: unknown,
): [string, string][] {
  return [
    [
      "system",
      `${BASE}
今は Edit モードです。選択中のノード [${selected.id}] だけを対象に、次の2種類の操作だけを提案できます:
- update: id="${selected.id}" の名前（必要なら種類）を変える
- add: parentId="${selected.id}" の直下に子ノードを追加する（id は new_1, new_2 ... の仮ID）
delete や、他のノードへの変更はしないでください。操作は1〜5件にしてください。`,
    ],
    ["human", `現在のマップ:\n${mapText}\n\n指示: ${instruction}${retryNote(errors, previous)}`],
  ];
}

export function agentPrompt(mapText: string, instruction: string, errors: string[], previous: unknown): [string, string][] {
  return [
    [
      "system",
      `${BASE}
今は Agent モードです。マップ全体を見て、指示を達成するための変更をまとめて提案してください。
使える操作: add（仮IDは new_1, new_2 ...。同じ提案内で先に add した仮IDを parentId に使ってよい）/ update / delete。
思考から計画、計画から行動へと具体化していく提案を優先し、操作は2〜10件にしてください。
削除は明確に不要・重複しているものだけにし、理由を書いてください。`,
    ],
    ["human", `現在のマップ:\n${mapText}\n\n指示: ${instruction}${retryNote(errors, previous)}`],
  ];
}
