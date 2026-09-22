import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "思考→計画→行動マップ × AI提案デモ",
  description: "AIがマインドマップの変更を提案し、人が差分を確認して承認したものだけを反映するデモ（Next.js + LangGraph.js）",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
