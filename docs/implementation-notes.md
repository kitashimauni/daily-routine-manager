# 実装メモ

設計書のMVP要件に合わせ、Today / Calendar / Routines / Stats の4画面を実装しています。

開発環境は `mise.toml` でNode.js 24.19.0とpnpm 11.22.0を固定しています。Next.jsは16.3.1、Reactは19.2.8を使用します。

ESLintは9.39.5、TypeScriptは6.0.3を使用しています。Next.js 16.3.1の現行`eslint-config-next`が利用するReact lint pluginはESLint 10実行時にAPI互換エラーになり、typescript-eslintはTypeScript 7のAPIに未対応のため、それぞれ現行ツールチェーンで検証できる最新互換版を選択しています。Next.js側のlint pluginとtypescript-eslintが対応した時点で更新を再確認します。

永続化層はPostgreSQL + Drizzleです。`users`、`sessions`、`auth_rate_limits`、`routines`、`routine_revisions`、`routine_logs` を `lib/db/schema.ts` で定義し、`drizzle/` のSQLマイグレーションで再現可能にしています。認証はメールアドレス・パスワードとHttpOnlyセッションCookieで行い、パスワードはNode.jsの`scrypt`でハッシュ化します。すべてのルーティーン・revision・log参照と更新は認証済みユーザーIDでスコープします。

認証APIはIP単位で15分あたりログイン10回・登録5回に制限し、メールアドレス254文字、パスワード256文字を上限とします。レート制限のカウンターもDBに保存するため、複数のアプリプロセス間で共有されます。

保存形式は `Routine`、`RoutineRevision`、`RoutineLog` に分け、ルーティーンの編集・無効化・再開は履歴として保存します。編集・再開は当日から、無効化は当日の完了実績を保持するため翌日から適用します。編集フォームから無効化はできず、専用の無効化操作に一本化しています。未来開始のrevisionを編集する場合は、過去・当日までの履歴だけを残して未来revisionを置き換えます。そのため、過去日の予定・表示名・優先度・統計は現在の設定に遡及しません。完了時だけログを作成し、取消時にログを削除します。

初回のアカウント登録時に、未完了状態のサンプルルーティーンをDBへ投入します。以前のブラウザ `localStorage` データは自動移行しません。ローカル開発は `compose.yaml` でPostgreSQLを起動し、`pnpm db:migrate` でスキーマを適用します。
