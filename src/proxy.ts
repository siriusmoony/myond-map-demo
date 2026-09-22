import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/session";

// 課金が発生するのは /api/agent だけなので、ここだけを門番で守る。
// 画面やデモモードは合言葉なしで見られるようにして、「まず触ってもらう」ハードルを下げている。
export const config = {
  matcher: "/api/agent",
};

export async function proxy(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "unauthorized", message: "合言葉を入力してください" }, { status: 401 });
  }
  // 通過時は何も返さない → そのまま Route Handler へ進む。
  // Route Handler 側でも同じ検証をする（proxy の matcher 変更などで守りが外れても大丈夫なように二重にしている）。
}
