import type { MindMap } from "./types";

// 面談・デモで説明しやすいよう、誰でも自分ごとにできるテーマを初期マップにしている。
// デモモードの固定応答（lib/demo/fixtures.ts）はこのIDを前提にしている。
export const SAMPLE_MAP: MindMap = {
  nodes: [
    { id: "t1", label: "副業で月5万円の収入をつくりたい", kind: "thought", parentId: null },
    { id: "t2", label: "得意なことを仕事にしたい", kind: "thought", parentId: "t1" },
    { id: "t3", label: "平日は時間が少ない", kind: "thought", parentId: "t1" },
    { id: "p1", label: "Webライティングを始める", kind: "plan", parentId: "t2" },
    { id: "a1", label: "ポートフォリオ記事を1本書く", kind: "action", parentId: "p1" },
    // Agent モードのデモで「重複の削除提案」を見せるため、ルートとほぼ同じ内容のノードを置いている
    { id: "t4", label: "収入を増やしたい", kind: "thought", parentId: "t1" },
  ],
};
