import { z } from "zod";
import type { Operation, Proposal } from "./types";

const kindSchema = z.enum(["thought", "plan", "action"]);

// LLMに渡すスキーマは、あえて「全フィールド必須・不要なものは null」のフラットな形にしている。
// - OpenAI の strict な構造化出力は optional や oneOf/union を嫌い、Anthropic とも挙動がずれやすい
// - フラットにしておけば、どちらのプロバイダでも同じスキーマで安定して返ってくる
// 型としての扱いやすさ（add/update/delete の判別共用体）は、受け取った後に toOperations で取り戻す。
export const rawOperationSchema = z.object({
  op: z.enum(["add", "update", "delete"]).describe("操作の種類"),
  id: z
    .string()
    .describe("add: 新しい仮ID（例 new_1）/ update・delete: 既存ノードのID"),
  parentId: z
    .string()
    .nullable()
    .describe("add のときの親ノードID（既存IDか、同じ提案内で先に add した仮ID）。それ以外は null"),
  label: z
    .string()
    .nullable()
    .describe("add: 新ノード名 / update: 新しい名前（変えないなら null）/ delete: null"),
  kind: kindSchema
    .nullable()
    .describe("add: 種類 / update: 新しい種類（変えないなら null）/ delete: null"),
  reason: z.string().describe("この変更を提案する理由（1文、日本語）"),
});

export const proposalSchema = z.object({
  summary: z.string().describe("提案全体の要約（1〜2文、日本語）"),
  operations: z.array(rawOperationSchema).describe("マップへの変更操作のリスト"),
});

export const askResultSchema = z.object({
  answer: z.string().describe("ユーザーの質問への回答（日本語、300字以内目安）"),
});

export type RawProposal = z.infer<typeof proposalSchema>;

export function toOperations(raw: RawProposal): Proposal {
  const operations: Operation[] = raw.operations.map((o) => {
    if (o.op === "add") {
      return {
        op: "add",
        id: o.id,
        parentId: o.parentId ?? "",
        label: o.label ?? "",
        kind: o.kind ?? "thought",
        reason: o.reason,
      };
    }
    if (o.op === "update") {
      return {
        op: "update",
        id: o.id,
        ...(o.label != null ? { label: o.label } : {}),
        ...(o.kind != null ? { kind: o.kind } : {}),
        reason: o.reason,
      };
    }
    return { op: "delete", id: o.id, reason: o.reason };
  });
  return { summary: raw.summary, operations };
}

// クライアントから届くマップは信用しない（改ざん・巨大入力の対策）。
export const LIMITS = {
  maxNodes: 60,
  maxLabel: 40,
  maxInstruction: 500,
  maxOperations: 12,
} as const;

export const mapSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        label: z.string().max(LIMITS.maxLabel * 2),
        kind: kindSchema,
        parentId: z.string().max(64).nullable(),
      }),
    )
    .max(LIMITS.maxNodes),
});

export const agentRequestSchema = z.object({
  mode: z.enum(["ask", "edit", "agent"]),
  map: mapSchema,
  selectedId: z.string().max(64).nullable(),
  instruction: z.string().trim().min(1).max(LIMITS.maxInstruction),
});

export type AgentRequest = z.infer<typeof agentRequestSchema>;
