"use client";

import { FormEvent, useState } from "react";
import { useRoutines } from "@/lib/routine-context";

export function AuthPanel() {
  const { error, login, register, retry } = useRoutines();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
    } catch {
      // The provider exposes the API error to the form.
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <div className="auth-brand"><span className="brand-mark">R</span><span><span className="brand-name">routine</span><span className="brand-subtitle">DAILY PRACTICE</span></span></div>
        <p className="eyebrow">{mode === "login" ? "Welcome back" : "Start your practice"}</p>
        <h1>{mode === "login" ? "ログイン" : "アカウントを作成"}</h1>
        <p className="auth-copy">ルーティーンを安全に保存して、どの端末からでも続きから始められます。</p>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="auth-email">メールアドレス</label>
          <input id="auth-email" className="text-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="auth-password">パスワード</label>
          <input id="auth-password" className="text-input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} />
          {mode === "register" && <p className="field-hint">12文字以上で入力してください。</p>}
          {error && <div className="auth-error" role="alert"><span>{error}</span><button type="button" onClick={() => void retry()}>再試行</button></div>}
          <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>{pending ? "処理中…" : mode === "login" ? "ログイン" : "登録する"}</button>
        </form>
        <button className="auth-switch" type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "初めて利用する方はこちら" : "すでにアカウントをお持ちの方はこちら"}
        </button>
      </div>
    </div>
  );
}
