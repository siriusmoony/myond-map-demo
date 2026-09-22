"use client";

import { useState } from "react";
import type { AiMode } from "@/lib/map/types";

const MODES: { id: AiMode; label: string; desc: string; placeholder: string; examples: string[] }[] = [
  {
    id: "ask",
    label: "Ask",
    desc: "選択したノードについて質問します。マップは変更しません。",
    placeholder: "例：このノードの次に何をすればいい？",
    examples: ["次に何をすればいい？", "この計画のリスクは？"],
  },
  {
    id: "edit",
    label: "Edit",
    desc: "選択したノードの名前変更と、子ノードの追加を提案します。",
    placeholder: "例：もっと具体的にして、子ノードを2つ追加して",
    examples: ["具体化して子ノードを追加して", "期限を入れて"],
  },
  {
    id: "agent",
    label: "Agent",
    desc: "マップ全体を見て、複数の変更をまとめて提案します。",
    placeholder: "例：思考ノードから計画・行動ノードを展開して",
    examples: ["思考から計画・行動を展開して", "重複を整理して"],
  },
];

export type AiStatus = {
  aiAvailable: boolean;
  provider: string;
  authenticated: boolean;
  remaining: number | null;
  max: number;
};

type Props = {
  mode: AiMode;
  onModeChange: (m: AiMode) => void;
  selectedLabel: string | null;
  demo: boolean;
  onDemoChange: (demo: boolean) => void;
  status: AiStatus | null;
  loading: boolean;
  locked: boolean;
  onSubmit: (instruction: string) => void;
  onLogin: (passcode: string) => Promise<string | null>;
};

export function AiPanel(p: Props) {
  const [instruction, setInstruction] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const current = MODES.find((m) => m.id === p.mode)!;
  const needsSelection = p.mode === "edit" && !p.selectedLabel;
  const needsLogin = !p.demo && !p.status?.authenticated;
  const canSend = !p.loading && !p.locked && !needsSelection && !needsLogin && instruction.trim().length > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">AIに頼む</h2>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          <button onClick={() => p.onDemoChange(true)} className={`rounded-md px-2.5 py-1 ${p.demo ? "bg-white shadow-sm" : "text-slate-500"}`}>
            デモモード
          </button>
          <button
            onClick={() => p.onDemoChange(false)}
            disabled={!p.status?.aiAvailable}
            title={p.status?.aiAvailable ? "" : "このサーバーではAIが設定されていません"}
            className={`rounded-md px-2.5 py-1 disabled:opacity-40 ${!p.demo ? "bg-white shadow-sm" : "text-slate-500"}`}
          >
            本物のAI
          </button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        {p.demo
          ? "用意した応答を再生します（APIキー不要）。画面の動きは本物と同じです。"
          : `LangGraph + ${p.status?.provider === "openai" ? "OpenAI" : "Claude"} で応答します。残り ${p.status?.remaining ?? "-"} / ${p.status?.max ?? "-"} 回`}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => p.onModeChange(m.id)}
            className={`rounded-lg py-1.5 text-sm font-semibold transition ${p.mode === m.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-600">{current.desc}</p>
      <p className="mt-1 text-xs text-slate-500">
        対象: {p.selectedLabel ? <span className="font-medium text-slate-800">「{p.selectedLabel}」</span> : p.mode === "agent" ? "マップ全体" : "（ノード未選択）"}
      </p>

      {needsLogin ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoginError(await p.onLogin(passcode));
          }}
        >
          <label className="block text-xs text-slate-600">本物のAIを使うには合言葉を入力してください</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-900"
              placeholder="合言葉"
            />
            <button className="rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white">入る</button>
          </div>
          {loginError && <p className="text-xs text-red-600">{loginError}</p>}
        </form>
      ) : (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) p.onSubmit(instruction.trim());
          }}
        >
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={current.placeholder}
            className="w-full resize-none rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-slate-900"
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {current.examples.map((ex) => (
              <button key={ex} type="button" onClick={() => setInstruction(ex)} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-200">
                {ex}
              </button>
            ))}
          </div>
          <button
            disabled={!canSend}
            className="mt-3 w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40"
          >
            {p.loading ? "考え中…" : p.locked ? "先に提案を承認か却下してください" : needsSelection ? "マップのノードを選択してください" : "送信"}
          </button>
        </form>
      )}
    </section>
  );
}
