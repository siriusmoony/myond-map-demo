/**
 * 合言葉を通過したことと、AIを何回呼んだかを「署名付きCookie」に持たせる。
 *
 * なぜDBを使わないか: デモの規模では、Redis などを用意するより構成が単純なほうが説明しやすく、無料枠で動かせるため。
 * 署名（HMAC）があるので、利用者がCookieを書き換えて回数を減らすことはできない。
 * ただし「Cookieを消して合言葉を入れ直す」と回数はリセットされる。本番ではサーバー側（Redis等）で数える（README参照）。
 *
 * proxy.ts からも使うので、Node専用APIではなく Web Crypto だけで書いている。
 */

export const SESSION_COOKIE = "md_session";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12時間

export type Session = { sid: string; calls: number; iat: number };

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  // 既定値を用意すると「設定し忘れたまま公開」しても動いてしまい、誰でも署名を偽造できる。だから必ず落とす。
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is not set (16+ chars required)");
  return s;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

// 文字列比較を途中で打ち切ると、一致した文字数が応答時間から推測できてしまう。最後まで比べる。
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(s: Session): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(s)));
  return `${body}.${await hmac(body)}`;
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    if (!safeEqual(sig, await hmac(body))) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    if (Date.now() / 1000 - s.iat > SESSION_MAX_AGE) return null;
    return s;
  } catch {
    return null;
  }
}

export function newSession(): Session {
  return { sid: crypto.randomUUID(), calls: 0, iat: Math.floor(Date.now() / 1000) };
}

export function maxCalls(): number {
  const n = Number(process.env.MAX_CALLS_PER_SESSION);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

// 合言葉は長さの違う文字列同士を比べることになるので、一度ハッシュして長さを揃えてから比較する。
export async function passcodeMatches(input: string): Promise<boolean> {
  const expected = process.env.DEMO_PASSCODE;
  if (!expected) return false;
  const h = async (v: string) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(v))));
  return safeEqual(await h(input), await h(expected));
}

export const cookieOptions = {
  httpOnly: true, // JavaScript から読めないようにして、XSS があってもトークンを盗まれにくくする
  sameSite: "strict" as const, // 他サイトから勝手に /api/agent を叩かせる（CSRF）ことを防ぐ
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE,
};
