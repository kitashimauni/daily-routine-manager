"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ja">
      <body style={{ margin: 0, background: "#f6f9fa", color: "#2d3d47", fontFamily: "sans-serif" }}>
        <main style={{ alignItems: "center", display: "flex", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
          <section style={{ background: "#fff", border: "1px solid #e2ebee", borderRadius: 16, maxWidth: 520, padding: 32, width: "100%" }} role="alert">
            <p style={{ color: "#e28b43", fontSize: 11, fontWeight: 700, letterSpacing: ".16em", margin: "0 0 10px", textTransform: "uppercase" }}>Something went wrong</p>
            <h1 style={{ color: "#15364a", fontSize: 28, margin: 0 }}>画面を読み込めませんでした</h1>
            <p style={{ color: "#78909d", fontSize: 13, lineHeight: 1.8 }}>一時的な問題が発生しました。再試行するか、トップへ戻ってください。</p>
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button type="button" onClick={() => reset()}>再試行</button>
              <Link href="/">トップへ戻る</Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
