"use client";

import { useState } from "react";
import { ALLOWED_CHILD_KINDS, KIND_LABEL, NODE_KINDS, type MapNode, type NodeKind, type Operation } from "@/lib/map/types";
import { KIND_STYLE } from "./kindStyles";

type Props = {
  node: MapNode;
  disabled: boolean;
  onApply: (op: Operation) => void;
};

// 手動編集も AI と同じ Operation を発行し、同じ applyProposal を通す。
// 人が編集してもAIが編集しても、同じルール（思考→計画→行動）で守られるようにするため。
export function NodeEditor({ node, disabled, onApply }: Props) {
  // 親が key にノードIDとラベルを渡しているので、別ノードを選ぶ・名前が変わると入力欄は作り直されて初期化される
  const [label, setLabel] = useState(node.label);
  const childKinds = ALLOWED_CHILD_KINDS[node.kind];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_STYLE[node.kind].chip}`}>{KIND_LABEL[node.kind]}</span>
        <h2 className="text-sm font-bold text-slate-900">選択中のノードを手で編集</h2>
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim() && label !== node.label) onApply({ op: "update", id: node.id, label, reason: "手動編集" });
        }}
      >
        <input
          value={label}
          maxLength={40}
          disabled={disabled}
          onChange={(e) => setLabel(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-900 disabled:bg-slate-50"
        />
        <button disabled={disabled} className="rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-40">
          名前変更
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {NODE_KINDS.filter((k) => k !== node.kind).map((k: NodeKind) => (
          <button
            key={k}
            disabled={disabled}
            onClick={() => onApply({ op: "update", id: node.id, kind: k, reason: "手動編集" })}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {KIND_LABEL[k]}に変更
          </button>
        ))}
        {childKinds.map((k) => (
          <button
            key={`add-${k}`}
            disabled={disabled}
            onClick={() => onApply({ op: "add", id: "manual", parentId: node.id, label: `新しい${KIND_LABEL[k]}`, kind: k, reason: "手動編集" })}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            ＋{KIND_LABEL[k]}を追加
          </button>
        ))}
        {node.parentId && (
          <button
            disabled={disabled}
            onClick={() => onApply({ op: "delete", id: node.id, reason: "手動編集" })}
            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            削除
          </button>
        )}
      </div>
    </section>
  );
}
