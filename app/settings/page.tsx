"use client";

import { useRef, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { useRoutines } from "@/lib/routine-context";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

interface ImportPreview {
  schemaVersion: unknown;
  routines: number;
  revisions: number;
  logs: number;
}

function responseError(body: unknown) {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "サーバーでエラーが発生しました。";
}

export default function SettingsPage() {
  const { authenticatedFetch, retry, user } = useRoutines();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const clearSelection = () => {
    setSelectedFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setError(null);
    setStatus(null);
    setPreview(null);
    setSelectedFile(file ?? null);
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError("ファイルサイズが大きすぎます。5MB以下のJSONを選択してください。");
      return;
    }
    try {
      const payload = JSON.parse(await file.text()) as { format?: unknown; schemaVersion?: unknown; data?: { routines?: unknown[]; revisions?: unknown[]; logs?: unknown[] } };
      if (payload.format !== "daily-routine-manager" || !payload.data || !Array.isArray(payload.data.routines) || !Array.isArray(payload.data.revisions) || !Array.isArray(payload.data.logs)) {
        throw new Error("対応していないエクスポート形式です。");
      }
      setPreview({ schemaVersion: payload.schemaVersion, routines: payload.data.routines.length, revisions: payload.data.revisions.length, logs: payload.data.logs.length });
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "JSONファイルを読み込めませんでした。");
      setPreview(null);
    }
  };

  const downloadExport = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = await authenticatedFetch("/api/data/export");
      if (!response.ok) throw new Error(responseError(await response.json().catch(() => null)));
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition");
      const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? "daily-routine-manager-export.json";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("データを書き出しました。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "データの書き出しに失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const importData = async () => {
    if (!selectedFile || !preview || busy) return;
    if (!window.confirm("現在のRoutine・履歴・完了ログを、選択したファイルの内容で置き換えます。現在のデータは失われます。続行しますか？")) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = await authenticatedFetch("/api/data/import", { method: "POST", body: await selectedFile.text() });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(body));
      await retry();
      setStatus(`${body.imported.routines}件のRoutine、${body.imported.revisions}件の履歴、${body.imported.logs}件の完了ログを復元しました。`);
      clearSelection();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "データの読み込みに失敗しました。既存データは変更されていません。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div><p className="eyebrow">Settings</p><h1>データ管理</h1><p>自分の記録を安全に持ち運ぶ。</p></div>
      </div>
      <div className="data-grid">
        <section className="card data-card">
          <p className="eyebrow">Export</p>
          <h2>データを書き出す</h2>
          <p>ログイン中のRoutine・変更履歴・完了ログだけをJSONファイルに保存します。パスワードやセッション情報、他ユーザーのデータは含まれません。</p>
          <button className="btn btn-primary" type="button" onClick={() => void downloadExport()} disabled={busy}>{busy ? "処理中…" : "JSONをダウンロード"}</button>
        </section>
        <section className="card data-card">
          <p className="eyebrow">Import</p>
          <h2>データを読み込む</h2>
          <p>読み込みは現在のアカウントのRoutine・変更履歴・完了ログを置き換えます。ユーザー情報とログイン状態は変更しません。</p>
          <label className="file-picker" htmlFor="data-import-file">JSONファイルを選択</label>
          <input ref={inputRef} id="data-import-file" className="file-input" type="file" accept="application/json,.json" onChange={(event) => void chooseFile(event)} disabled={busy} />
          {selectedFile && <div className="selected-file"><span>{selectedFile.name}</span><button className="text-btn" type="button" onClick={clearSelection} disabled={busy}>解除</button></div>}
          {preview && <div className="import-preview" aria-live="polite"><strong>読み込み内容の確認</strong><span>schema version: {String(preview.schemaVersion)}</span><span>Routine {preview.routines}件 / 履歴 {preview.revisions}件 / 完了ログ {preview.logs}件</span></div>}
          <button className="btn btn-danger" type="button" onClick={() => void importData()} disabled={busy || !preview}>{busy ? "処理中…" : "この内容で置き換える"}</button>
          <p className="field-hint">不正なファイルは検証で拒否され、既存データは変更されません。</p>
        </section>
      </div>
      <section className="settings-account card">
        <div>
          <p className="eyebrow">Account</p>
          <h2>アカウント</h2>
          <p className="settings-account-copy">現在ログインしているアカウント</p>
          <p className="settings-account-email">{user?.email}</p>
        </div>
        <LogoutButton className="btn btn-danger settings-logout" />
      </section>
      {error && <p className="data-message error" role="alert">{error}</p>}
      {status && <p className="data-message success" role="status">{status}</p>}
    </div>
  );
}
