import { NextResponse, type NextRequest } from "next/server";
import { currentProvider, hasApiKey } from "@/lib/agent/model";
import { maxCalls, SESSION_COOKIE, verifySession } from "@/lib/session";

// 画面が「AIモードを出すか / 残り何回か」を決めるための情報。秘密は一切返さない。
export async function GET(request: NextRequest) {
  const aiAvailable = hasApiKey() && !!process.env.DEMO_PASSCODE && !!process.env.SESSION_SECRET;
  const session = aiAvailable ? await verifySession(request.cookies.get(SESSION_COOKIE)?.value) : null;
  return NextResponse.json({
    aiAvailable,
    provider: currentProvider(),
    authenticated: !!session,
    remaining: session ? Math.max(0, maxCalls() - session.calls) : null,
    max: maxCalls(),
  });
}
