import { afterEach, describe, expect, it } from "vitest";
import { runGraph } from "@/lib/agent/graph";
import { createModel, currentProvider, type StructuredModel } from "@/lib/agent/model";
import { SAMPLE_MAP } from "@/lib/map/sample";

/** 決められた応答を順番に返す偽モデル。受け取ったプロンプトも記録する */
function fakeModel(responses: unknown[]) {
  const prompts: [string, string][][] = [];
  const model: StructuredModel = {
    withStructuredOutput: () => ({
      invoke: async (messages) => {
        prompts.push(messages);
        const next = responses.shift();
        if (next === undefined) throw new Error("no more fake responses");
        return next;
      },
    }),
  };
  return { model, prompts };
}

const addOp = (parentId: string, kind: string, id = "new_1") => ({
  op: "add",
  id,
  parentId,
  label: "朝30分だけ作業する",
  kind,
  reason: "平日の時間不足に対応",
});

describe("agent graph", () => {
  it("ask mode returns an answer and never proposes changes", async () => {
    const { model } = fakeModel([{ answer: "まず1本書きましょう" }]);
    const out = await runGraph(model, { mode: "ask", map: SAMPLE_MAP, selectedId: "a1", instruction: "何から？" });
    expect(out).toEqual({ kind: "answer", answer: "まず1本書きましょう", trace: ["START", "ask", "END"] });
  });

  it("agent mode returns a validated proposal on the first try", async () => {
    const { model } = fakeModel([{ summary: "s", operations: [addOp("t3", "plan")] }]);
    const out = await runGraph(model, { mode: "agent", map: SAMPLE_MAP, selectedId: null, instruction: "展開して" });
    expect(out.kind).toBe("proposal");
    if (out.kind === "proposal") expect(out.attempts).toBe(1);
  });

  it("sends validation errors back to the model and retries once", async () => {
    const { model, prompts } = fakeModel([
      { summary: "bad", operations: [addOp("a1", "thought")] }, // 行動の下に思考 → NG
      { summary: "good", operations: [addOp("t3", "plan")] },
    ]);
    const out = await runGraph(model, { mode: "agent", map: SAMPLE_MAP, selectedId: null, instruction: "展開して" });
    expect(out.kind).toBe("proposal");
    if (out.kind === "proposal") expect(out.attempts).toBe(2);
    expect(prompts[1][1][1]).toContain("前回の提案はプログラムの検証で却下されました");
    expect(out.trace).toEqual(["START", "agent", "validate: NG（1件）", "agent", "validate: OK", "END"]);
  });

  it("gives up after MAX_ATTEMPTS and returns the errors", async () => {
    const bad = { summary: "bad", operations: [addOp("a1", "thought")] };
    const { model, prompts } = fakeModel([bad, bad, bad]);
    const out = await runGraph(model, { mode: "agent", map: SAMPLE_MAP, selectedId: null, instruction: "x" });
    expect(out.kind).toBe("error");
    expect(prompts).toHaveLength(2);
  });

  it("edit mode rejects changes outside the selected node", async () => {
    const outside = { summary: "s", operations: [addOp("t1", "thought")] };
    const inside = { summary: "s", operations: [addOp("t3", "plan")] };
    const { model } = fakeModel([outside, inside]);
    const out = await runGraph(model, { mode: "edit", map: SAMPLE_MAP, selectedId: "t3", instruction: "具体化" });
    expect(out.kind).toBe("proposal");
    if (out.kind === "proposal") expect(out.attempts).toBe(2);
  });

  it("edit mode without a selection stops before calling the model", async () => {
    const { model, prompts } = fakeModel([]);
    const out = await runGraph(model, { mode: "edit", map: SAMPLE_MAP, selectedId: null, instruction: "x" });
    expect(out.kind).toBe("error");
    expect(prompts).toHaveLength(0);
  });
});

describe("model factory", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("switches provider by LLM_PROVIDER", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    expect(currentProvider()).toBe("openai");
    expect(createModel().constructor.name).toBe("ChatOpenAI");

    process.env.LLM_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(createModel().constructor.name).toBe("ChatAnthropic");
  });
});
