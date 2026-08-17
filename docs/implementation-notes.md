# 実装メモ

設計書のMVP要件に合わせ、Today / Calendar / Routines / Stats の4画面を実装しています。

開発環境は `mise.toml` でNode.js 24.19.0とpnpm 11.22.0を固定しています。Next.jsは16.3.1、Reactは19.2.8を使用します。

ESLintは9.39.5を使用しています。Next.js 16.3.1の現行`eslint-config-next`が利用するReact lint pluginはESLint 10実行時にAPI互換エラーになるため、検証可能な最新互換版を選択しています。Next.js側のlint pluginが対応した時点でESLint 10への更新を再確認します。

現時点のリポジトリにはDB接続情報がないため、ブラウザの `localStorage` を永続層として利用しています。保存形式は `Routine` と `RoutineLog` に分け、完了時だけログを作成し、取消時にログを削除します。PostgreSQL + Drizzleへ移行する場合は、`lib/routine-context.tsx` の操作関数をAPI呼び出しに置き換える構成です。

初回アクセス時のみ、画面の使い方が確認できるサンプルルーティーンを投入します。ユーザーが登録・編集・無効化したデータは以後ローカルに保持されます。
