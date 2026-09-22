import { END, ReducedValue, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { askResultSchema, proposalSchema, toOperations } from "../map/schema";
import type { AiMode, MindMap, Proposal } from "../map/types";
import { validateProposal } from "../map/validateProposal";
import type { StructuredModel } from "./model";
import { agentPrompt, askPrompt, editPrompt, renderMap } from "./prompts";

/**
 * LLM が1回で正しい提案を出せなかった場合に、何回まで作り直させるか。
 * 1回目 + 差し戻し1回 = 最大2回。上限を置かないと、直せない指示で延々とAPIを叩いてコストが膨らむ。
 */
export const MAX_ATTEMPTS = 2;

// グラフの各ノードが読み書きする「共有メモ」。
// ノード同士は直接呼び合わず、このメモを更新し合うだけにしておくことで、
// ノードを足したり順番を変えたりしても、他のノードのコードを触らずに済む。
const AgentState = new StateSchema({
  mode: z.enum(["ask", "edit", "agent"]),
  map: z.custom<MindMap>(),
  selectedId: z.string().nullable(),
  instruction: z.string(),
  answer: z.string().nullable().default(null),
  proposal: z.custom<Proposal | null>().default(null),
  validationErrors: z.array(z.string()).default(() => []),
  attempts: z.number().default(0),
  // どのノードをどの順で通ったかの記録。画面に表示して「差し戻しループが実際に回った」ことを見せるために使う。
  // 他の項目は上書きだが、これだけは追記（reducer）にしている。
  trace: new ReducedValue(z.array(z.string()).default(() => []), {
    inputSchema: z.string(),
    reducer: (current: string[], next: string) => [...current, next],
  }),
});

type State = typeof AgentState.State;

/**
 * 構成:
 *   START ──(mode で分岐)──▶ ask ─────────────────────────▶ END
 *                        ├─▶ edit ──▶ validate ──(OK)────▶ END
 *                        └─▶ agent ─▶ validate ──(NG)──▶ edit/agent に差し戻し（上限まで）
 *
 * なぜグラフにしたか:
 * - 「生成 → 検証 → ダメなら直させる」というループは、if 文と while で書くと分岐が増えるほど読みにくくなる。
 *   ノードとエッジに分けておくと、構成図がそのまま処理の説明になり、将来「承認待ちで止める」「ツールを呼ぶ」
 *   などのノードを差し込むのも容易になる。
 *
 * なぜ承認（Human-in-the-loop）はここに含めていないか:
 * - LangGraph には interrupt() でグラフを止めて人の返事を待つ仕組みがあるが、それには途中状態を保存する
 *   チェックポインタ（DB）が必要。Vercel のサーバーレス関数はリクエストごとに別インスタンスになり得るので、
 *   メモリ上の保存では承認時に状態が消えている可能性がある。
 * - そこでこのデモでは、グラフは「検証済みの提案を返す」ところで終わり、承認と反映はブラウザ側の純関数
 *   （applyProposal）で行う。サーバーは状態を持たず、提案内容はユーザーの画面で必ず確認される。
 */
export function buildGraph(model: StructuredModel) {
  const proposer = model.withStructuredOutput(proposalSchema, { name: "propose_map_changes" });
  const answerer = model.withStructuredOutput(askResultSchema, { name: "answer_question" });

  // 返ってきたJSONが形として壊れていた場合（想定外の種類名など）も、例外で落とさずに
  // 検証エラーと同じ扱いにして差し戻しループに乗せる。一度の揺らぎでユーザーにエラーを見せないため。
  const propose = async (prompt: [string, string][], s: State, node: "edit" | "agent") => {
    const parsed = proposalSchema.safeParse(await proposer.invoke(prompt));
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `出力の形式が不正です（${i.path.join(".")}: ${i.message}）`);
      return { proposal: null, validationErrors: errors, attempts: s.attempts + 1, trace: node };
    }
    return { proposal: toOperations(parsed.data), attempts: s.attempts + 1, trace: node };
  };

  const selectedNode = (s: State) => s.map.nodes.find((n) => n.id === s.selectedId) ?? null;

  const ask = async (s: State) => {
    const prompt = askPrompt(renderMap(s.map, s.selectedId), selectedNode(s)?.label ?? null, s.instruction);
    const result = askResultSchema.parse(await answerer.invoke(prompt));
    return { answer: result.answer, trace: "ask" };
  };

  const edit = async (s: State) => {
    const selected = selectedNode(s);
    // 選択なしで Edit に来るのは API を直接叩かれた場合くらい。LLM を呼ぶ前に止めて無駄な課金を避ける。
    if (!selected)
      return { validationErrors: ["Editモードではノードを1つ選択してください"], attempts: MAX_ATTEMPTS, trace: "edit (未選択のため中止)" };
    const prompt = editPrompt(renderMap(s.map, s.selectedId), selected, s.instruction, s.validationErrors, s.proposal);
    return propose(prompt, s, "edit");
  };

  const agent = async (s: State) => {
    const prompt = agentPrompt(renderMap(s.map, s.selectedId), s.instruction, s.validationErrors, s.proposal);
    return propose(prompt, s, "agent");
  };

  // LLM を信用しきらず、プログラムでルールを確かめる番人。
  // ここでエラーになった内容は、そのまま次の生成へのフィードバックとして使われる。
  const validate = (s: State) => {
    const errors = s.proposal
      ? validateProposal(s.map, s.proposal, { mode: s.mode, selectedId: s.selectedId })
      : s.validationErrors.length
        ? s.validationErrors
        : ["提案が生成されませんでした"];
    return { validationErrors: errors, trace: errors.length ? `validate: NG（${errors.length}件）` : "validate: OK" };
  };

  const afterValidate = (s: State): "done" | "retry_edit" | "retry_agent" => {
    if (s.validationErrors.length === 0) return "done";
    if (s.attempts >= MAX_ATTEMPTS) return "done"; // 諦めてエラーごと返す。画面側で「提案を作れませんでした」と表示する
    return s.mode === "edit" ? "retry_edit" : "retry_agent";
  };

  return new StateGraph(AgentState)
    .addNode("ask", ask)
    .addNode("edit", edit)
    .addNode("agent", agent)
    .addNode("validate", validate)
    .addConditionalEdges(START, (s: State): AiMode => s.mode, { ask: "ask", edit: "edit", agent: "agent" })
    .addEdge("ask", END)
    .addEdge("edit", "validate")
    .addEdge("agent", "validate")
    .addConditionalEdges("validate", afterValidate, {
      done: END,
      retry_edit: "edit",
      retry_agent: "agent",
    })
    .compile();
}

export type GraphInput = { mode: AiMode; map: MindMap; selectedId: string | null; instruction: string };

export type GraphOutput = { trace: string[] } & (
  | { kind: "answer"; answer: string }
  | { kind: "proposal"; proposal: Proposal; attempts: number }
  | { kind: "error"; errors: string[]; attempts: number }
);

export async function runGraph(model: StructuredModel, input: GraphInput): Promise<GraphOutput> {
  const final = await buildGraph(model).invoke(input);
  const trace = ["START", ...final.trace, "END"];
  if (input.mode === "ask") return { kind: "answer", answer: final.answer ?? "", trace };
  if (final.validationErrors.length > 0 || !final.proposal)
    return { kind: "error", errors: final.validationErrors, attempts: final.attempts, trace };
  return { kind: "proposal", proposal: final.proposal, attempts: final.attempts, trace };
}
