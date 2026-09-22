"use client";

import type { MindMap, Operation, Proposal } from "@/lib/map/types";
import { KIND_LABEL } from "@/lib/map/types";
import { KIND_STYLE } from "./kindStyles";

const OP_BADGE: Record<Operation["op"], [string, string]> = {
  add: ["追加", "bg-emerald-600"],
  update: ["変更", "bg-amber-500"],
  delete: ["削除", "bg-red-500"],
};

type Props = {
  map: MindMap;
  proposal: Proposal;
  accepted: boolean[];
  onToggle: (index: number) => void;
  onApprove: () => void;
  onReject: () => void;
};

export function DiffPanel({ map, proposal, accepted, onToggle, onApprove, onReject }: Props) {
  const labelOf = (id: string) => {
    const existing = map.nodes.find((n) => n.id === id)?.label;
    if (existing) return existing;
    const added = proposal.operations.find((o) => o.op === "add" && o.id === id);
    return added && added.op === "add" ? added.label : id;
  };
  const count = accepted.filter(Boolean).length;

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">AIの提案（未反映）</h2>
        <span className="text-xs text-slate-500">{proposal.operations.length}件の変更</span>
      </div>
      <p className="mt-1 text-sm text-slate-700">{proposal.summary}</p>

      <ul className="mt-3 space-y-2">
        {proposal.operations.map((op, i) => {
          const [badge, badgeColor] = OP_BADGE[op.op];
          const target = map.nodes.find((n) => n.id === op.id);
          return (
            <li key={i}>
              <label className={`flex cursor-pointer gap-2 rounded-lg border bg-white p-2.5 text-sm transition ${accepted[i] ? "border-slate-200" : "border-dashed border-slate-300 opacity-55"}`}>
                <input type="checkbox" className="mt-1 accent-slate-900" checked={accepted[i]} onChange={() => onToggle(i)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${badgeColor}`}>{badge}</span>
                    {op.op === "add" && (
                      <>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_STYLE[op.kind].chip}`}>{KIND_LABEL[op.kind]}</span>
                        <span className="font-medium text-slate-900">{op.label}</span>
                      </>
                    )}
                    {op.op === "update" && (
                      <span className="text-slate-900">
                        <span className="text-slate-500 line-through">{target?.label}</span>
                        {" → "}
                        <span className="font-medium">{op.label ?? target?.label}</span>
                        {op.kind && op.kind !== target?.kind && <span className="ml-1 text-xs text-slate-500">（{KIND_LABEL[op.kind]}へ）</span>}
                      </span>
                    )}
                    {op.op === "delete" && <span className="font-medium text-slate-900 line-through">{target?.label ?? op.id}</span>}
                  </div>
                  {op.op === "add" && <div className="mt-0.5 text-xs text-slate-500">親: {labelOf(op.parentId)}</div>}
                  {op.op === "delete" && <div className="mt-0.5 text-xs text-red-600">配下のノードも一緒に削除されます</div>}
                  <div className="mt-1 text-xs text-slate-600">理由: {op.reason}</div>
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex gap-2">
        <button
          onClick={onApprove}
          disabled={count === 0}
          className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40"
        >
          承認して反映（{count}件）
        </button>
        <button onClick={onReject} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          却下
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        チェックを外した変更は反映されません。承認するまでマップは変わりません。
      </p>
    </section>
  );
}
