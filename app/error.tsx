"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="error-shell">
      <section className="error-card card" role="alert">
        <p className="eyebrow">Something went wrong</p>
        <h1>画面を読み込めませんでした</h1>
        <p>一時的な問題が発生しました。再試行するか、トップへ戻ってください。</p>
        <div className="error-actions">
          <button className="btn btn-primary" type="button" onClick={() => reset()}>再試行</button>
          <Link className="btn btn-secondary" href="/">トップへ戻る</Link>
        </div>
      </section>
    </main>
  );
}
