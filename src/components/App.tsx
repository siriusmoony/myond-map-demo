"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GraphOutput } from "@/lib/agent/graph";
import { demoRespond } from "@/lib/demo/fixtures";
import { applyProposal } from "@/lib/map/applyProposal";
import { buildPreview } from "@/lib/map/diff";
import { SAMPLE_MAP } from "@/lib/map/sample";
import { KIND_LABEL, NODE_KINDS, type AiMode, type MindMap, type Operation, type Proposal } from "@/lib/map/types";
import { AiPanel, type AiStatus } from "./AiPanel";
import { DiffPanel } from "./DiffPanel";
import { KIND_STYLE } from "./kindStyles";
import { MindMap as MindMapView } from "./MindMap";
import { NodeEditor } from "./NodeEditor";

const STORAGE_KEY = "myond-demo-map-v1";

function loadMap(): MindMap {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as MindMap;
  } catch {}
  return SAMPLE_MAP;
}

type Pending = { proposal: Proposal; accepted: boolean[] };
type Info = { tone: "info" | "error"; title: string; body?: string; list?: string[] };

export function App() {
  // このコンポーネントはブラウザでだけ描画する（AppLoader 参照）ので、初期値を直接 localStorage から読める
  const [map, setMap] = useState<MindMap>(loadMap);
  const [undo, setUndo] = useState<MindMap | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>("t3");
  const [mode, setMode] = useState<AiMode>("ask");
  const [demo, setDemo] = useState(true);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [trace, setTrace] = useState<string[] | null>(null);
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {}
  }, [map]);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      setStatus((await res.json()) as AiStatus);
    } catch {}
  }, []);
  useEffect(() => {
    fetch("/api/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: AiStatus) => setStatus(s))
      .catch(() => {});
  }, []);

  const selected = map.nodes.find((n) => n.id === selectedId) ?? null;

  const previewNodes = useMemo(
    () =>
      pending
        ? buildPreview(map, pending.proposal.operations, (i) => pending.accepted[i])
        : map.nodes.map((n) => ({ ...n, status: "unchanged" as const })),
    [map, pending],
  );

  const commit = (next: MindMap) => {
    setUndo(map);
    setMap(next);
  };

  const applyManual = (op: Operation) => {
    const r = applyProposal(map, [op]);
    if (r.skipped.length) setInfo({ tone: "error", title: "その編集はできません", body: r.skipped[0].error });
    else {
      commit(r.map);
      setInfo(null);
      if (op.op === "delete") setSelectedId(null);
    }
  };

  const handleResult = (out: GraphOutput & { remaining?: number }) => {
    setTrace(out.trace);
    if (typeof out.remaining === "number") setStatus((s) => (s ? { ...s, remaining: out.remaining! } : s));
    if (out.kind === "answer") setInfo({ tone: "info", title: "AIの回答", body: out.answer });
    else if (out.kind === "error") setInfo({ tone: "error", title: "提案を作れませんでした", list: out.errors });
    else {
      setInfo(null);
      setPending({ proposal: out.proposal, accepted: out.proposal.operations.map(() => true) });
    }
  };

  const submit = async (instruction: string) => {
    setLoading(true);
    setInfo(null);
    setTrace(null);
    try {
      if (demo) {
        handleResult(await demoRespond(mode, map, selectedId));
        return;
      }
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, map, selectedId, instruction }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) await refreshStatus();
        if (typeof data.remaining === "number") setStatus((s) => (s ? { ...s, remaining: data.remaining } : s));
        setInfo({ tone: "error", title: `エラー（${res.status}）`, body: data.message ?? "不明なエラー" });
        return;
      }
      handleResult(data);
    } catch {
      setInfo({ tone: "error", title: "通信に失敗しました" });
    } finally {
      setLoading(false);
    }
  };

  const login = async (passcode: string): Promise<string | null> => {
    const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode }) });
    if (res.ok) {
      await refreshStatus();
      return null;
    }
    return ((await res.json().catch(() => ({}))) as { message?: string }).message ?? "ログインに失敗しました";
  };

  const approve = () => {
    if (!pending) return;
    const r = applyProposal(map, pending.proposal.operations, (i) => pending.accepted[i]);
    commit(r.map);
    setPending(null);
    setInfo(
      r.skipped.length
        ? { tone: "error", title: `${r.applied.length}件を反映、${r.skipped.length}件はスキップしました`, list: r.skipped.map((s) => s.error) }
        : { tone: "info", title: `${r.applied.length}件の変更を反映しました`, body: "「元に戻す」で直前の状態に戻せます。" },
    );
    if (selectedId && !r.map.nodes.some((n) => n.id === selectedId)) setSelectedId(null);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 lg:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-base font-bold sm:text-lg">思考 → 計画 → 行動 マップ × AI提案デモ</h1>
          <p className="text-xs text-slate-500">AIが提案 → 差分を確認 → 人が承認したものだけ反映（Next.js + LangGraph.js）</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 text-xs sm:flex">
            {NODE_KINDS.map((k) => (
              <span key={k} className="flex items-center gap-1">
                <span className={`h-2.5 w-2.5 rounded-full ${KIND_STYLE[k].dot}`} />
                {KIND_LABEL[k]}
              </span>
            ))}
          </div>
          <button
            onClick={() => {
              if (undo) {
                setMap(undo);
                setUndo(null);
                setInfo(null);
              }
            }}
            disabled={!undo || !!pending}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
          >
            元に戻す
          </button>
          <button
            onClick={() => {
              setMap(SAMPLE_MAP);
              setUndo(map);
              setPending(null);
              setSelectedId("t3");
              setInfo(null);
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            サンプルに戻す
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        <div className="relative h-[60vh] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1">
          <ReactFlowProvider>
            <MindMapView
              nodes={previewNodes}
              selectedId={selectedId}
              previewing={!!pending}
              onSelect={(id) => !pending && setSelectedId(id)}
            />
          </ReactFlowProvider>
          {pending && (
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white shadow">
              プレビュー中：承認するまでマップは変わりません
            </div>
          )}
        </div>

        <aside className="w-full space-y-3 overflow-y-auto border-t border-slate-200 bg-slate-50 p-4 lg:w-[400px] lg:border-l lg:border-t-0">
          <AiPanel
            mode={mode}
            onModeChange={setMode}
            selectedLabel={selected?.label ?? null}
            demo={demo}
            onDemoChange={setDemo}
            status={status}
            loading={loading}
            locked={!!pending}
            onSubmit={submit}
            onLogin={login}
          />

          {trace && (
            <section className="rounded-2xl border border-slate-200 bg-white p-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">LangGraph の実行経路</h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
                {trace.map((t, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-slate-400">→</span>}
                    <span className={`rounded px-1.5 py-0.5 font-mono ${t.includes("NG") ? "bg-red-100 text-red-700" : t.includes("OK") ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                      {t}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {pending && (
            <DiffPanel
              map={map}
              proposal={pending.proposal}
              accepted={pending.accepted}
              onToggle={(i) => setPending({ ...pending, accepted: pending.accepted.map((v, j) => (j === i ? !v : v)) })}
              onApprove={approve}
              onReject={() => {
                setPending(null);
                setInfo({ tone: "info", title: "提案を却下しました", body: "マップは変更されていません。" });
              }}
            />
          )}

          {info && (
            <section className={`rounded-2xl border p-4 text-sm ${info.tone === "error" ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
              <h3 className="font-bold">{info.title}</h3>
              {info.body && <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-700">{info.body}</p>}
              {info.list && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-700">
                  {info.list.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {selected && !pending && <NodeEditor key={`${selected.id}:${selected.label}`} node={selected} disabled={loading} onApply={applyManual} />}
          {!selected && !pending && (
            <p className="px-1 text-xs text-slate-500">マップのノードをクリックすると選択できます。選択したノードは手でも編集できます。</p>
          )}
        </aside>
      </main>
    </div>
  );
}
