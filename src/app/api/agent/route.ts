import { NextResponse, type NextRequest } from "next/server";
import { runGraph } from "@/lib/agent/graph";
import { createModel, hasApiKey } from "@/lib/agent/model";
import { agentRequestSchema } from "@/lib/map/schema";
import { cookieOptions, maxCalls, SESSION_COOKIE, signSession, verifySession } from "@/lib/session";

// LangChain の SDK は Node の API を使うので Node ランタイムで動かす。
// 差し戻しループで最大2回 LLM を呼ぶため、既定より長めに待てるようにしておく。
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized", message: "合言葉を入力してください" }, { status: 401 });

  if (!hasApiKey()) {
    return NextResponse.json({ error: "no_api_key", message: "サーバーにAPIキーが設定されていません。デモモードをお使いください" }, { status: 503 });
  }

  const limit = maxCalls();
  if (session.calls >= limit) {
    return NextResponse.json(
      { error: "rate_limited", message: `このセッションのAI呼び出し上限（${limit}回）に達しました` },
      { status: 429 },
    );
  }

  const parsed = agentRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", message: "リクエストの形式が正しくありません" }, { status: 400 });
  }

  // LLM を呼ぶ前にカウントを進める。失敗時に数えないと、エラーを起こす入力で無制限に叩けてしまうため。
  const updated = { ...session, calls: session.calls + 1 };
  const remaining = limit - updated.calls;

  try {
    const result = await runGraph(createModel(), parsed.data);
    const res = NextResponse.json({ ...result, remaining });
    res.cookies.set(SESSION_COOKIE, await signSession(updated), cookieOptions);
    return res;
  } catch (e) {
    // 詳細（プロバイダのエラー文など）はサーバーログにだけ残し、利用者には一般的な文言を返す
    console.error("[api/agent]", e);
    const res = NextResponse.json({ error: "llm_error", message: "AIの呼び出しに失敗しました。少し待ってから再度お試しください", remaining }, { status: 502 });
    res.cookies.set(SESSION_COOKIE, await signSession(updated), cookieOptions);
    return res;
  }
}
