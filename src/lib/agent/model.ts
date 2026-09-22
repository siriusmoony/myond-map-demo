import "server-only"; // APIキーを読むモジュールがクライアントのバンドルに混ざったらビルドを失敗させる

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";

/**
 * グラフが LLM に求めるのは「スキーマを渡すと、その形のデータを返してくれる」ことだけ。
 * ChatAnthropic も ChatOpenAI も withStructuredOutput を持っているので、この最小インターフェースに揃えておけば
 * グラフ・プロンプト・スキーマは一切変えずにプロバイダを差し替えられる（テストでは偽物を差し込める）。
 */
export type StructuredModel = {
  withStructuredOutput: (
    schema: unknown,
    config?: { name?: string; method?: "functionCalling" | "jsonSchema" },
  ) => { invoke: (messages: [string, string][]) => Promise<unknown> };
};

export type Provider = "anthropic" | "openai";

// 応答は小さなJSONだが、Claude は答える前に「考える」トークン（adaptive thinking）も max_tokens に含めて数える。
// 低すぎると考えている途中で打ち切られ JSON が返らないので、余裕を持たせつつ暴走時のコストは頭打ちにする。
const MAX_TOKENS = 8000;

export function currentProvider(): Provider {
  return process.env.LLM_PROVIDER === "openai" ? "openai" : "anthropic";
}

export function hasApiKey(provider: Provider = currentProvider()): boolean {
  return provider === "openai" ? !!process.env.OPENAI_API_KEY : !!process.env.ANTHROPIC_API_KEY;
}

export function createModel(provider: Provider = currentProvider()): StructuredModel {
  if (provider === "openai") {
    return new ChatOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
      apiKey: process.env.OPENAI_API_KEY,
      maxTokens: MAX_TOKENS,
    }) as unknown as StructuredModel;
  }
  const claude = new ChatAnthropic({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens: MAX_TOKENS,
    // マップ編集の提案は重い推論ではないので、考える量を抑えて速度とコストを優先する
    outputConfig: { effort: "medium" },
  });
  // LangChain の withStructuredOutput は既定で「このツールを必ず呼べ」と強制する方式（functionCalling）を使う。
  // しかし Claude Sonnet 5 以降は thinking を指定しないと自動で考えてから答える設定になり、
  // 「考える」と「ツール呼び出しの強制」は同時に使えない（API が 400 を返す）。
  // そこで Claude では API ネイティブの構造化出力（output_config.format = JSON Schema）を使う。こちらは考えながらでも使え、
  // スキーマどおりの JSON が返ることを API 側が保証する。呼び出し側（グラフ）はこの違いを知らなくてよい。
  return {
    withStructuredOutput: (schema, config) =>
      claude.withStructuredOutput(schema as Parameters<typeof claude.withStructuredOutput>[0], {
        ...config,
        method: "jsonSchema",
      }) as ReturnType<StructuredModel["withStructuredOutput"]>,
  };
}
