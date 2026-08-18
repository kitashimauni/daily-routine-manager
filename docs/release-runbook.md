# 本番リリースRunbook

## 採用構成

- アプリ: Vercel、Production Branchは `main`
- DB: 管理PostgreSQL（Neon PostgreSQLを第一候補）
- Preview: Vercel Preview + Preview専用DB接続先
- Production: Vercel Production + Production専用DB接続先
- DB schema: `drizzle/` のSQL migration

VercelのPreview / Productionは別の環境変数を持てます。PreviewのmigrationがProduction DBへ接続しないよう、`DATABASE_URL` は同じ値を複数環境へ登録せず、`DEPLOY_ENV` もそれぞれ `preview` / `production` に設定します。Neonのbranchingを使う場合は、Preview用branchとProduction用branchを分けます。

公式仕様: [Vercel Environments](https://vercel.com/docs/deployments/environments)、[Environment Variables](https://vercel.com/docs/environment-variables)、[System Environment Variables](https://vercel.com/docs/environment-variables/system-environment-variables)、[Neon branching](https://api-docs.neon.tech/reference/createprojectbranch)

## 初回セットアップ

1. VercelでGitHub repository `kitashimauni/daily-routine-manager`を連携する。
2. Production Branchを `main` にする。Pull RequestのPreview deploymentを有効にする。
3. VercelのSystem Environment Variablesを有効にし、`VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA` をruntimeでも利用できるようにする。
4. 管理PostgreSQLでProduction DBとPreview DB（またはPreview専用branch）を作成する。
5. Vercelの各環境へ次を登録する。

| Variable | Preview | Production |
| --- | --- | --- |
| `DATABASE_URL` | Preview DB URL | Production DB URL |
| `DEPLOY_ENV` | `preview` | `production` |
| `APP_TIME_ZONE` | `Asia/Tokyo` | `Asia/Tokyo` |
| `RELEASE_VERSION` | 任意 | 任意 |

`DATABASE_URL`はsecretとして登録し、リポジトリへ書き込まない。`ALLOW_TEST_DATABASE_RESET`はどのVercel環境にも登録しない。

本番URLはVercel Project Domainを確定後、次の欄とGitHubのEnvironment説明へ記録する。

```text
Production URL: <set after Vercel project/domain setup>
Database backup retention: <record provider and confirmed retention>
```

## デプロイ順序

`vercel.json`で次の順序を固定している。

```text
verify:deploy → db:migrate → next build → Vercel deployment publish
```

1. PRを作成し、Preview DBに対するPreview deploymentとsmoke testを実行する。
2. migrationを含む変更は、Previewでmigration成功と主要フローを確認する。
3. `main`へmergeする。
4. Vercel Production buildがProduction `DATABASE_URL`を検証し、migrationを適用してからbuild・公開する。
5. `/api/health`でcommit SHAとenvironmentを確認し、smoke testを実行する。

Migrationは既存アプリが動作したまま適用されるため、破壊的変更はexpand / migrate / contractの順に分割する。migration失敗時はVercelのdeploymentを公開せず、ログとDB migration履歴を確認して原因を修正する。

## Rollback / 復旧

アプリだけを戻す場合はVercelのRollbackで直前のdeploymentへ戻す。ただしDB migrationは自動でdown migrationしない。既に適用したschemaを戻す必要がある場合は、migration作成者が互換性を確認したうえで、バックアップからの復元または明示的なforward-fixを選択する。

復旧の標準手順:

1. 影響を受ける操作を告知し、必要ならメンテナンスを開始する。
2. 対象commit、migration履歴、直近バックアップ時刻を記録する。
3. managed PostgreSQL providerのrestore機能、または取得済みdumpを使って復元する。
4. `pnpm db:migrate`でschemaを確認し、`SMOKE_BASE_URL`に対してsmoke testを実行する。
5. `/api/health`のcommit SHA、認証、Routine、Calendar、Statsを確認してメンテナンスを終了する。

手動dumpの例（実際の接続先と保管先はsecret管理・暗号化ストレージを使う）:

```bash
pg_dump --format=custom --no-owner --file=backup-$(date +%Y%m%d-%H%M%S).dump "$DATABASE_URL"
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" backup-YYYYMMDD-HHMMSS.dump
```

Production DBではproviderの自動バックアップまたはPITRを有効にし、最低7日間の復旧可能期間を確保する。実際のprovider、保持期間、最後のrestore drillは上記の記録欄とGitHub Environmentの説明に残す。少なくとも `users`、`routines`、`routine_revisions`、`routine_logs` が復旧対象であることを確認する。

## 認証とネットワーク確認

- ProductionはHTTPSで公開する。アプリはProductionの `NODE_ENV` でSession Cookieに `Secure`、`HttpOnly`、`SameSite=Lax`、`Path=/` を設定する。
- VercelではRate LimitのClient IPとしてVercelが設定する `x-vercel-forwarded-for` / `x-real-ip`だけを参照する。クライアントが送った一般の `x-forwarded-for`はVercel runtimeでは無視する。
- `TRUST_PROXY_HEADERS`はE2Eまたは管理下の開発proxy以外では設定しない。
- Productionのsmoke testで新規登録、ログイン、ログアウトを確認し、429が同一IP単位で機能することを確認する。

Vercelのheader仕様: [Request Headers](https://vercel.com/docs/headers/request-headers)

## Release tracking

Git tagとVercelのcommit SHAを紐付ける。

```bash
git tag -a v0.1.0 <main-commit-sha> -m "Release v0.1.0"
git push origin v0.1.0
```

公開後は次を保存する。

- Git tag / GitHub Release
- Vercel deployment URL
- `/api/health`の `release.version`、`release.commitSha`、`release.environment`
- 適用済みmigration名
- DB backup / restore drillの日時と結果

## Smoke test

自動確認:

```powershell
$env:SMOKE_BASE_URL = "https://<production-domain>"
$env:SMOKE_EXPECTED_COMMIT_SHA = "<vercel-git-commit-sha>"
mise exec -- pnpm smoke
```

Productionで次のチェックリストも実行する。

1. 新規登録 / ログイン / ログアウト
2. Routineを追加できる
3. 完了 / 取消ができる
4. Calendarへ反映される
5. Statsへ反映される
6. 編集後も過去履歴が変化しない
7. 無効化が翌日から、再開が当日から反映される
8. 再読み込み / 再ログイン後もデータが保持される
9. 別ユーザー間でデータが分離される
10. モバイル幅で主要操作が可能
