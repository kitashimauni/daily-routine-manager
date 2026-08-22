# 本番リリースRunbook

## 採用構成

- アプリ: Docker self-host、Node.js 24、Next.js standalone image
- DB: `postgres:18-alpine` のProduction専用コンテナと永続volume
- 入口: 外部HTTPS reverse proxy（Caddy / Nginx等）。アプリは直接Internetへ公開しない
- Production: `main` のcommit、Production専用Compose project / DB / secret
- Preview: Preview専用hostまたはCompose project / DB / secret。Productionの接続先を設定しない
- DB schema: `drizzle/` のSQL migration

`compose.prod.yaml`は`app`、`postgres`、one-shotの`migrate`を分離する。`app`はDocker network上の`:3000`だけを`expose`し、PostgreSQLもhostへ`ports`公開しない。reverse proxyは`routine-frontend` networkへ参加し、`app:3000`をupstreamにする。appとmigrateはDockerfileで`nextjs`非rootユーザー、backupは固定digestのPostgreSQL公式image内`postgres`非rootユーザーで実行する。backupのbind mountは、そのimage内の`postgres` UID/GIDが書き込める所有者・permissionに設定する。

Production URL: `<reverse-proxyで設定した本番HTTPS URL>`
Backup storage: `<host外または別ストレージのバックアップ保存先>`
Backup retention: `7日以上（実際の保持期間をここへ記録）`

## 初回セットアップ

1. Docker Engine / Compose v2 と、外部HTTPS reverse proxyを用意する。運用hostではNode.jsを直接実行せず、Docker imageを実行する。
2. 本番用の作業ディレクトリで設定ファイルを作成する。

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

3. `.env.production`の`POSTGRES_PASSWORD`、`DATABASE_URL`、`BACKUP_DIR`を実値へ置き換える。`DATABASE_URL`のhostはCompose内の`postgres`、`RELEASE_BRANCH`は`main`にする。`RELEASE_COMMIT_SHA`はexampleのplaceholderのままでもよく、deploy scriptが実際のsource commit SHAで上書きする。SHAを手入力してdeployしない。
4. 本番用のfrontend networkを一度だけ作成する。

```bash
docker network create routine-frontend
```

5. reverse proxyを`routine-frontend` networkへ接続し、HTTPSのupstreamを`http://app:3000`にする。外部からappへ直接到達できるhost portやFirewall ruleを作らない。
6. proxyは外部から受け取った`X-Forwarded-For` / `X-Real-IP`を破棄・上書きし、proxyが観測したclient IPを1つの値としてappへ渡す。appとproxyはこの管理下networkだけで接続する。
7. `.env.production`はGitへcommitせず、バックアップ先のディレクトリは本番DB volumeとは別のhost外ストレージへ同期する。

backup用bind mountの所有者を、固定digestのPostgreSQL image内`postgres`ユーザーへ合わせる。以下はLinux hostでの例である。

```bash
POSTGRES_IMAGE='postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2'
BACKUP_UID="$(docker run --rm --entrypoint id "$POSTGRES_IMAGE" -u postgres)"
BACKUP_GID="$(docker run --rm --entrypoint id "$POSTGRES_IMAGE" -g postgres)"
sudo install -d -o "$BACKUP_UID" -g "$BACKUP_GID" -m 700 /srv/daily-routine-manager/backups
```

### DNS / HTTPS

- 本番hostname（例: `routine.example.com`）のA / AAAAまたはCNAMEをreverse proxyの公開endpointへ向ける。
- proxyは80番へのアクセスを443番へredirectし、ACME等で証明書を自動更新する。証明書の更新失敗を監視し、期限切れ前に確認する。
- Production URL、DNSレコード、証明書更新方式、最後にHTTPS接続を確認した日時をこのrunbookの冒頭と運用記録へ記録する。
- `Secure` Cookieを有効にする前に、proxy経由のHTTPS URLで登録・ログイン・再読み込みを確認する。

Previewを作る場合は、別hostまたは別Compose project、別`routine-preview-frontend` / `routine-preview-backend` network、別PostgreSQL volume、別`.env.preview`を用意する。Previewの`DATABASE_URL`へProductionのhost / database / credentialsを設定しない。`.env.preview.example`をコピーして実値へ置き換え、`docker network create routine-preview-frontend`を実行する。`BACKEND_NETWORK_NAME`、`FRONTEND_NETWORK_NAME`、`COMPOSE_PROJECT_NAME`がProductionと異なることを確認する。

## 本番環境変数

`.env.production.example`を実際に必要な変数の基準にする。

| Variable | Production | Preview |
| --- | --- | --- |
| `DATABASE_URL` | Production DB（Compose内では`postgres`） | Preview専用DB |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Production専用 | Preview専用 |
| `DEPLOY_ENV` | `production` | `preview` |
| `APP_TIME_ZONE` | `Asia/Tokyo` | `Asia/Tokyo` |
| `RELEASE_VERSION` | リリースversion | Preview version |
| `RELEASE_COMMIT_SHA` | `main`へdeployするcommit SHA | Preview commit SHA |
| `RELEASE_BRANCH` | `main` | PR / 作業ブランチ |
| `TRUST_PROXY_HEADERS` | `true`（管理下proxy必須） | `true`（管理下proxyの場合） |
| `BACKUP_DIR` | host外の保存先 | Production保存先と共有しない |
| `BACKUP_RETENTION_DAYS` | 7以上 | 任意 |

`ALLOW_TEST_DATABASE_RESET`と`RESET_TEST_DATABASE`は、Production / Previewのどちらにも設定しない。

## Deploy手順

Docker image buildはDBへ接続せず、migrationは別のone-shot serviceで実行する。

```bash
git fetch origin main
git checkout main
git pull --ff-only origin main
test -z "$(git status --porcelain)"
mise exec -- pnpm release:production -- --compose-env-file .env.production
```

`release:production`がcleanな`main` worktreeを検証し、`git rev-parse HEAD`でrelease SHAを導出してから、同じworktreeをComposeのbuild contextに指定する。Composeのapp imageは`daily-routine-manager:<commit-sha>`、migrate imageは`daily-routine-manager-migrate:<commit-sha>`として作成される。Compose validationは`config --quiet`で構文と必須変数だけを検証し、展開済みの`DATABASE_URL`や`POSTGRES_PASSWORD`を標準出力へ表示しない。ネットワークや`ports`の設定は、レビュー済みの`compose.prod.yaml`とCIの検証で確認する。app起動後はDocker healthcheckがhealthyになるまで待機し、`/api/health`のrelease SHAが対象commitと一致した場合だけ成功扱いにする。既定のhealth待機timeoutは120秒で、`RELEASE_HEALTH_TIMEOUT_SECONDS`と`RELEASE_HEALTH_POLL_INTERVAL_SECONDS`で調整できる。

`release:production`のvalidationが失敗した場合も、Composeの標準エラーをそのまま再出力せず、secretがログへ混入しないようにする。sentinel secretを使った回帰検証は次で実行する。

```bash
mise exec -- pnpm test:release-security
mise exec -- pnpm test:release-health
```

起動順序は次のとおりである。

```text
Docker image build（DB変更なし）
  → postgres healthcheck
  → verify:deploy + db:migrate（migrate one-shot）
  → app起動
  → Docker healthcheck healthy + `/api/health`のrelease SHA一致
  → HTTPS reverse proxy経由でsmoke test
```

`migrate`の環境検証またはmigrationが失敗した場合、`app`は起動しない。app起動後に次を確認する。

```bash
docker compose --env-file .env.production -f compose.prod.yaml ps
docker compose --env-file .env.production -f compose.prod.yaml logs --tail=100 migrate app
```

migrationはforward-onlyで管理し、破壊的変更はexpand / migrate / contractに分割する。既存appと互換性のあるschemaを先に適用し、データ変換と古いコードの削除を別リリースにする。

## DBバックアップ

PostgreSQLのnamed volumeは可用性のための永続化であり、バックアップではない。`backup` serviceは固定digestの`postgres:18-alpine`の`pg_dump`でcustom-format dumpとSHA-256 checksumを作成し、`BACKUP_DIR`へ保存して7日を超えたファイルを削除する。

手動実行:

```bash
docker compose --profile ops --env-file .env.production -f compose.prod.yaml run --rm backup
```

Linux hostのcron例（毎日03:00 UTC、保存先はhost外へ同期する）。

```cron
0 3 * * * cd /srv/daily-routine-manager && docker compose --profile ops --env-file .env.production -f compose.prod.yaml run --rm backup >> /var/log/daily-routine-manager-backup.log 2>&1
```

バックアップ保存先はDB hostとは別のdisk / host / object storageへコピーし、権限を運用アカウントだけに制限する。最低限、`users`、`routines`、`routine_revisions`、`routine_logs`が含まれるdumpであること、ファイルサイズ、checksum、作成時刻、保持期間を定期確認する。

## Restore / 復旧

アプリだけを戻す場合は、同じschemaと互換性のある過去のimage tagを起動する。DB migration適用後のschemaを自動で戻すdown migrationは行わず、互換性を確認したforward-fix、または明示的なDB restoreを選択する。

標準restore手順:

1. 操作を停止またはメンテナンス画面にし、対象commit、migration履歴、バックアップ時刻を記録する。
2. appを停止する。

```bash
docker compose --env-file .env.production -f compose.prod.yaml stop app
```

3. 対象dumpのchecksumを確認し、PostgreSQLへrestoreする。実行前に対象DBとdumpを再確認する。

```bash
sha256sum -c /srv/daily-routine-manager/backups/routine-YYYYMMDDTHHMMSSZ.dump.sha256
docker run --rm --network routine-backend \
  --env-file .env.production \
  -v /srv/daily-routine-manager/backups:/backups:ro \
  postgres:18-alpine \
  sh -ec 'pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" /backups/routine-YYYYMMDDTHHMMSSZ.dump'
```

4. `docker compose ... run --rm migrate`でschemaを確認し、appを再起動する。
5. `/api/health`、smoke test、認証、Routine、Calendar、Statsを確認してメンテナンスを終了する。

少なくとも月1回、Productionとは別のPreview / 隔離DBへ最新dumpをrestoreするrestore drillを行う。dumpが開けること、4つの主要テーブルを参照できること、migrationとsmoke testが成功すること、所要時間と結果をGitHub Environmentまたは運用記録へ残す。

## Rollback

- image / appだけの不具合: 現在のworktreeを変更せず、既知のmain上のcommitまたはtagから一時detached worktreeを作成してbuild・再起動する。スクリプトが対象commitの祖先関係、cleanな現在worktree、source SHAとDocker image / health metadataの一致を検証し、Docker healthcheckと`/api/health`のrelease SHA確認が完了するまで成功扱いにしない。

```bash
git fetch origin main
test -z "$(git status --porcelain)"
mise exec -- pnpm release:production -- --rollback <known-main-commit-or-tag> --compose-env-file .env.production
```

`RELEASE_COMMIT_SHA`だけを過去値へ変更して現在のsourceをbuildする操作は禁止する。rollback imageは`daily-routine-manager:<target-commit-sha>`として残るため、healthの`release.commitSha`、Composeのimage tag、対象source commitを突合する。
- migration失敗: `migrate`のログと`drizzle` migration履歴を確認し、原因修正後に同じone-shot migrationを再実行する。失敗中はappを公開しない。
- 適用済みschemaの不整合: down migrationを自動実行せず、互換性のあるforward-fixまたはバックアップrestoreを選択する。

## 認証とネットワーク確認

- ProductionはHTTPSのみで公開し、Session Cookieの`Secure`、`HttpOnly`、`SameSite=Lax`、`Path=/`を確認する。
- `app:3000`とPostgreSQLにhost `ports`がないことを確認する。Internetからappへ直接接続できる場合、`TRUST_PROXY_HEADERS=true`を有効にしない。
- `TRUST_PROXY_HEADERS=true`は、唯一のingressであるreverse proxyがforwarded headerを破棄・上書きする場合だけ使用する。
- proxyを経由しないリクエスト、または任意のforwarded headerを注入したリクエストがrate limitのIPを変更できないことを確認する。
- 管理下proxy経由では、異なるclient IPが別々のrate-limit bucketになること、同一client IPでは429が機能することを確認する。

Vercel専用のheaderやenvironmentには依存しない。self-hostではproxyの正規化済み`x-forwarded-for` / `x-real-ip`だけを参照する。`/api/health`はDB接続も確認し、DB停止時は503を返す。

## Release tracking

リリース前に`main`のcommit SHAとversionを記録し、Git tagをpushする。

```bash
git tag -a v0.1.0 <main-commit-sha> -m "Release v0.1.0"
git push origin v0.1.0
```

公開後は次を保存する。

- Git tag / GitHub Release
- `RELEASE_VERSION`、`RELEASE_COMMIT_SHA`、`RELEASE_BRANCH`
- `/api/health`の`release.version`、`release.commitSha`、`release.environment`
- 適用済みmigration名
- Docker image digest
- DB backup / restore drillの日時と結果

## Smoke test

自動確認:

```powershell
$env:SMOKE_BASE_URL = "https://<production-domain>"
$env:SMOKE_EXPECTED_COMMIT_SHA = "<release-commit-sha>"
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
8. 終了日を過ぎたRoutineの編集で予定が復活せず、明示的な延長 / 再開だけで復帰する
9. 非JSTのブラウザでもToday / Calendar / Stats / Routine作成初期値が`APP_TIME_ZONE`基準になる
10. 再読み込み / 再ログイン後もデータが保持される
11. 別ユーザー間でデータが分離される
12. モバイル幅で主要操作が可能
