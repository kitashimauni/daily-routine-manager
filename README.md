# daily-routine-manager

毎日やりたいことを、ワンタップで記録するルーティーン管理アプリです。

## 画面

- `/` — Today：指定日のルーティーン確認と完了記録
- `/calendar` — Calendar：必須ルーティーンを基準にした月間履歴
- `/routines` — Routines：作成・編集・無効化
- `/stats` — Stats：必須 / 任意の期間別・ルーティーン別達成率

## 開発

```powershell
mise install
pnpm install
Copy-Item .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

Windowsでmise本体が未導入の場合は、先に `scoop install mise` または `winget install jdx.mise` を実行してください。

通常のブラウザでは `http://localhost:3000` を開きます。

初回アクセス時にアカウントを登録して利用します。ルーティーンと完了ログはPostgreSQLにユーザー単位で保存されるため、ブラウザを変えても同じアカウントで参照できます。

`.env` には次の環境変数を設定します。

- `DATABASE_URL` — PostgreSQL接続URL
- `POSTGRES_PORT` — Composeで公開するPostgreSQLポート（既定値は `5432`）
- `APP_TIME_ZONE` — 日付の境界に使うIANAタイムゾーン（既定値は `Asia/Tokyo`）

既存のブラウザ `localStorage` データは自動移行しません。本番用の永続化基盤へ切り替えるため、必要なデータはDB移行後に再登録してください。

スキーマを変更した場合は、次の順にマイグレーションを生成・適用します。

```bash
pnpm db:generate
pnpm db:migrate
```

## 検証

GitHub Actions（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）で、Pull Requestと `main` へのpush時に、miseで固定したNode.js / pnpmを使って同じ検証を自動実行します。CIは専用のPostgreSQLサービスだけを使い、本番DBへ接続しません。

テスト用PostgreSQLを起動して、履歴境界・ログ・認証・ユーザー分離の統合テストを実行します。テストDBは開発用DBとは別ポート・別データベースです。

```powershell
docker compose -f compose.test.yaml up -d --wait
mise exec -- pnpm test
```

主要なブラウザフローを実行する場合は、先に本番ビルドを作成してからPlaywrightを起動します。

```powershell
mise exec -- pnpm build
mise exec -- pnpm exec playwright install chromium
mise exec -- pnpm test:e2e
```

テストDBが不要になったら、コンテナとデータを削除できます。

```powershell
docker compose -f compose.test.yaml down --volumes
```

```bash
mise exec -- pnpm exec tsc --noEmit
mise exec -- pnpm lint
mise exec -- pnpm test
mise exec -- pnpm build
mise exec -- pnpm test:e2e
mise exec -- pnpm db:check
mise exec -- pnpm audit --audit-level high
```
