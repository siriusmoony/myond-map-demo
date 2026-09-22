import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, newSession, passcodeMatches, SESSION_COOKIE, signSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  if (!process.env.DEMO_PASSCODE || !process.env.SESSION_SECRET) {
    return NextResponse.json({ error: "not_configured", message: "このサーバーではAIモードが無効です（デモモードをお使いください）" }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { passcode?: unknown };
  const passcode = typeof body.passcode === "string" ? body.passcode.slice(0, 200) : "";

  if (!(await passcodeMatches(passcode))) {
    // 総当たりを遅くするための小さな待ち。本格的な対策はIP単位の制限だが、デモではここまでにしている。
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "invalid_passcode", message: "合言葉が違います" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(newSession()), cookieOptions);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
