"use client";

import dynamic from "next/dynamic";

// マップは localStorage とブラウザの描画領域に依存するので、サーバーでは描画しない。
// サーバー描画するとサンプルと保存済みマップの食い違い（hydration mismatch）が起きるため。
export const AppLoader = dynamic(() => import("./App").then((m) => m.App), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center text-sm text-slate-500">読み込み中…</div>,
});
