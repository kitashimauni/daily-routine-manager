# daily-routine-manager

毎日やりたいことを、ワンタップで記録するルーティーン管理アプリです。

## 画面

- `/` — Today：指定日のルーティーン確認と完了記録
- `/calendar` — Calendar：必須ルーティーンを基準にした月間履歴
- `/routines` — Routines：作成・編集・無効化
- `/stats` — Stats：必須 / 任意の期間別・ルーティーン別達成率
- `/settings` — Settings：ユーザーデータのJSONエクスポート・インポート

Todayの`?date=YYYY-MM-DD`は実在する日付だけを受け付けます。形式不正・存在しない日付は今日へ戻し、未来の日付は閲覧のみ、過去の日付は履歴確認用として扱います。ルーティーンの記録APIでは未来日や対象外の日への保存を拒否します。

アプリの「今日」は`APP_TIME_ZONE`（既定`Asia/Tokyo`）を基準にします。ブラウザが別のタイムゾーンでも、Today / Calendar / Stats / Routine作成初期値とAPIの日付判定は同じ基準で動作します。

## 開発

```powershell
mise install
mise exec -- pnpm install
Copy-Item .env.example .env
docker compose up -d postgres
mise exec -- pnpm db:migrate
mise exec -- pnpm dev
```

Windowsでmise本体が未導入の場合は、先に `scoop install mise` または `winget install jdx.mise` を実行してください。

通常のブラウザでは `http://localhost:3000` を開きます。

## 本番リリース

本番構成はDocker self-hostです。アプリとPostgreSQLは`compose.prod.yaml`で管理し、外部のHTTPS reverse proxyだけをInternetの入口にします。`app`はDocker network上の`3000`だけで待ち受け、PostgreSQLはhostへ公開しません。Productionは`main`のcommit、Previewは検証用の別DBとrelease情報を指定して起動します。設定の詳細と初回セットアップ、migration、バックアップ、復旧、smoke testは[`docs/release-runbook.md`](docs/release-runbook.md)を参照してください。

Productionのdeployは、`main`のcleanなGit worktreeから`mise exec -- pnpm release:production`を実行します。スクリプトが`git rev-parse HEAD`からcommit SHAを導出し、同じsourceをDocker build contextにして、SHA付きimage tagと`/api/health`のrelease metadataへ注入します。rollbackは`--rollback <commit-or-tag>`で対象commitの一時detached worktreeを作成するため、現在のコードへ過去SHAだけを設定することはできません。image buildにはDB変更を含めず、one-shotの`migrate` serviceで環境検証とmigrationを実行してから`app`を起動します。migrationが失敗した場合はappを起動しません。appのDocker healthcheckがhealthyになり、`/api/health`のrelease SHAが起動対象commitと一致した後だけdeploy成功として終了します。稼働中のcommit、version、環境は`GET /api/health`で確認できます。

```bash
mise exec -- pnpm release:production --compose-env-file .env.production
# rollback: mainのcleanなworktreeで実行する
mise exec -- pnpm release:production --rollback <known-main-commit-or-tag> --compose-env-file .env.production
```

初回アクセス時にアカウントを登録して利用します。新規登録直後はルーティーン0件の状態で始まり、Todayの「最初のルーティーンを追加」から登録できます。ルーティーンと完了ログはPostgreSQLにユーザー単位で保存されるため、ブラウザを変えても同じアカウントで参照できます。

APIやDBの一時障害が起きた場合、既に表示しているルーティーンやログ、編集中の入力は保持したままエラーを表示します。画面上の「データを再読み込み」からバックグラウンドで再取得でき、保存操作はサーバーの成功応答を受けた場合だけ画面へ反映します。認証エラーは同じ入力を「再送信」でき、セッション切れ（401）の場合は古いデータを消去してログイン画面へ戻します。ログイン・登録のレート制限（429）や予期しない画面エラー（500）には、次に取る操作を表示します。

`.env` には次の環境変数を設定します。

- `DATABASE_URL` — PostgreSQL接続URL
- `POSTGRES_PORT` — Composeで公開するPostgreSQLポート（既定値は `5432`）
- `APP_TIME_ZONE` — 日付の境界に使うIANAタイムゾーン（既定値は `Asia/Tokyo`）
- `DEPLOY_ENV` — デプロイ先の環境（ローカルは `local`、Previewは `preview`、Productionは `production`）
- `RELEASE_VERSION` — `/api/health`で表示するリリースバージョン（未指定時はpackage.jsonのversion）
- `RELEASE_COMMIT_SHA` — 稼働commit SHA（Production / Previewでは必須）
- `RELEASE_BRANCH` — 稼働ブランチ（Productionは `main` 必須）
- `TRUST_PROXY_HEADERS` — 管理下のreverse proxyがclient IPを正規化した場合だけ `true`

Settingsのデータ管理では、ログイン中ユーザーのRoutine / Revision / Logだけをschema version付きJSONとして書き出せます。書き出しはread-only `REPEATABLE READ` transaction内で同一snapshotを取得します。読み込みは現在のユーザーの同じ3種類のデータを置き換える方式で、別アカウントへ読み込む場合も内部IDを再発行します。password hash、Session、他ユーザーのデータは対象外です。不正なファイルや未知のschema versionは反映前に拒否し、読み込みはtransactionで実行します。認証付きのデータ操作でセッションが期限切れになった場合は、共通の認証経路でログイン画面へ復帰します。

既存のブラウザ `localStorage` データは自動移行しません。本番用の永続化基盤へ切り替えるため、必要なデータはDB移行後に再登録してください。

スキーマを変更した場合は、次の順にマイグレーションを生成・適用します。

```bash
mise exec -- pnpm db:generate
mise exec -- pnpm db:migrate
```

## 検証

GitHub Actions（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）で、Pull Requestと `main` へのpush時に、miseで固定したNode.js / pnpmを使って同じ検証を自動実行します。CIは専用のPostgreSQLサービスだけを使い、本番DBへ接続しません。

テスト用PostgreSQLを起動して、履歴境界・ログ・認証・ユーザー分離の統合テストを実行します。テストDBは開発用DBとは別ポート・別データベースです。
テストランナーは接続先DB名が `routine_test` であること、`DATABASE_URL` と `TEST_DATABASE_URL` が一致すること、破壊的リセットの明示フラグがあることを確認し、条件を満たさなければ停止します。

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
mise exec -- pnpm test:release-health
mise exec -- pnpm test:release-security
mise exec -- pnpm build
mise exec -- pnpm test:e2e
mise exec -- pnpm db:check
mise exec -- pnpm audit --audit-level high
mise exec -- pnpm verify:deploy
docker compose --profile ops --env-file .env.production.example -f compose.prod.yaml config --quiet
docker build --target runner --tag daily-routine-manager:ci --build-arg RELEASE_VERSION=0.1.0 --build-arg RELEASE_COMMIT_SHA=local --build-arg RELEASE_BRANCH=local .
docker build --target migrate --tag daily-routine-manager:migrate-ci .
```

Production / Previewの公開URLを確認する場合は、HTTPS reverse proxy経由のURLを指定して`SMOKE_BASE_URL=https://... mise exec -- pnpm smoke`を実行します。Productionでは`SMOKE_EXPECTED_COMMIT_SHA`に`RELEASE_COMMIT_SHA`を指定すると、想定commitとの一致も確認できます。
