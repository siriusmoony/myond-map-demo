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
    config?: { name?: string },
  ) => { invoke: (messages: [string, string][]) => Promise<unknown> };
};

export type Provider = "anthropic" | "openai";

// 応答は小さなJSONなので上限を低めにしておく。暴走時のコストを頭打ちにするため。
const MAX_TOKENS = 2000;

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
  return new ChatAnthropic({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens: MAX_TOKENS,
  }) as unknown as StructuredModel;
}
