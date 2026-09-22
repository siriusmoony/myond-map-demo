import type { NodeKind } from "@/lib/map/types";

// 種類ごとの色は画面のどこでも同じにする（凡例・ノード・差分リストで色の意味がぶれないように）
export const KIND_STYLE: Record<NodeKind, { chip: string; card: string; dot: string }> = {
  thought: {
    chip: "bg-violet-100 text-violet-800",
    card: "border-violet-300 bg-violet-50",
    dot: "bg-violet-500",
  },
  plan: {
    chip: "bg-sky-100 text-sky-800",
    card: "border-sky-300 bg-sky-50",
    dot: "bg-sky-500",
  },
  action: {
    chip: "bg-emerald-100 text-emerald-800",
    card: "border-emerald-300 bg-emerald-50",
    dot: "bg-emerald-500",
  },
};
