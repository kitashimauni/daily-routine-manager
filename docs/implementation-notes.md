# 実装メモ

設計書のMVP要件に合わせ、Today / Calendar / Routines / Stats の4画面を実装しています。

開発環境は `mise.toml` でNode.js 24.19.0とpnpm 11.22.0を固定しています。Next.jsは16.3.1、Reactは19.2.8を使用します。

ESLintは9.39.5、TypeScriptは6.0.3を使用しています。Next.js 16.3.1の現行`eslint-config-next`が利用するReact lint pluginはESLint 10実行時にAPI互換エラーになり、typescript-eslintはTypeScript 7のAPIに未対応のため、それぞれ現行ツールチェーンで検証できる最新互換版を選択しています。Next.js側のlint pluginとtypescript-eslintが対応した時点で更新を再確認します。

永続化層はPostgreSQL + Drizzleです。`users`、`sessions`、`auth_rate_limits`、`routines`、`routine_revisions`、`routine_logs` を `lib/db/schema.ts` で定義し、`drizzle/` のSQLマイグレーションで再現可能にしています。認証はメールアドレス・パスワードとHttpOnlyセッションCookieで行い、パスワードはNode.jsの`scrypt`でハッシュ化します。すべてのルーティーン・revision・log参照と更新は認証済みユーザーIDでスコープします。

認証APIはIP単位で15分あたりログイン10回・登録5回に制限し、メールアドレス254文字、パスワード256文字を上限とします。レート制限のカウンターもDBに保存するため、複数のアプリプロセス間で共有されます。

保存形式は `Routine`、`RoutineRevision`、`RoutineLog` に分け、ルーティーンの編集・無効化・再開は履歴として保存します。編集・再開は当日から、無効化は当日の完了実績を保持するため翌日から適用します。編集フォームから無効化はできず、専用の無効化操作に一本化しています。未来開始のrevisionを編集する場合は、過去・当日までの履歴だけを残して未来revisionを置き換えます。そのため、過去日の予定・表示名・優先度・統計は現在の設定に遡及しません。完了時だけログを作成し、取消時にログを削除します。

Todayの`?date=YYYY-MM-DD`は形式とカレンダー上の存在を厳密に検証し、不正値は今日へフォールバックします。過去日は履歴確認用に表示し、未来日は閲覧のみとします。日付ツールバーは左右の矢印と中央の日付領域を固定した3列レイアウトにし、TODAYチップや補助アクションの有無で位置・高さが変わらないようにしています。過去日・未来日では常に「今日に戻る」を表示し、未来日は閲覧専用表示と併記します。API側でも同じ日付検証を行い、未来日・対象外曜日・無効なrevisionへの記録を拒否します。
Calendarは全体表示を既定とし、`?routine=<id>`または表示対象selectorでユーザー自身のRoutine単位へ切り替えられます。Routine単位の各日セルは、`routineForDate`でその日のRevision・曜日・有効状態を復元したうえで、完了・予定あり未完了・予定なしを表示します。不正または他ユーザーのRoutine IDは全体表示へ安全にフォールバックし、無効化済みRoutineもselectorから除外せず過去の履歴を確認できます。Routines画面から対象RoutineのCalendarへ直接遷移できます。

クライアントの保存操作は成功レスポンスを受けてから状態を更新するため、API / DB障害時に成功表示へ進みません。通信失敗時は既存データと編集中フォームを保持し、「データを再読み込み」で画面をアンマウントせずに再取得します。認証の429/409/401などは入力とモードを保持したまま同じ認証リクエストを再送信できます。401を受けた場合はユーザー・ルーティーン・ログを即時消去してログイン画面へ戻し、500は内部情報を隠した一般メッセージを返します。Next.jsの`error.tsx` / `global-error.tsx`にも再試行とトップへの復旧導線を用意しています。

初回のアカウント登録時はUserとSessionだけを作成し、Routine / RoutineRevision / RoutineLogは空状態で開始します。Todayでは「まだルーティーンがありません」と最初の追加導線を表示し、Routines画面では登録フォームをそのまま利用できます。既存ユーザーのデータは変更・削除しません。以前のブラウザ `localStorage` データは自動移行しません。ローカル開発は `compose.yaml` でPostgreSQLを起動し、`pnpm db:migrate` でスキーマを適用します。

テストはVitestの実DB統合テストとPlaywrightの主要ユーザーフローで構成しています。`compose.test.yaml` の専用PostgreSQL（既定ポート5433、`routine_test`データベース）またはCIのサービスコンテナへマイグレーションを適用してから実行します。テストランナーは `TEST_DATABASE_URL` を `DATABASE_URL` に設定し直し、DB名・接続URL一致・明示的なリセット許可を共通ガードで確認するため、開発用・本番用の接続先を利用しません。固定時計を使い、Asia/Tokyoの日付境界に依存するテストを再現可能にしています。

本番運用はDocker self-host + 外部HTTPS reverse proxyを前提にする。`scripts/deploy-production.mjs`がcleanな`main` worktreeの`git rev-parse HEAD`をrelease SHAとして導出し、その同じsourceをDocker build contextにして、SHA付きimage tag・`RELEASE_COMMIT_SHA`・`/api/health`へ同じ値を注入する。rollbackは対象main commitの一時detached worktreeを作成するため、SHAだけを書き換えて別sourceをbuildできない。`compose.prod.yaml`の`app`、`postgres`、one-shotの`migrate`を分離し、image build → `migrate` → `app`の順に実行する。image buildではDB migrationを実行しない。Production / Previewの`DATABASE_URL`と`DEPLOY_ENV`は別の設定にし、`RELEASE_BRANCH`、`/api/health`で稼働commitを追跡する。Rate LimitはVercel専用ヘッダーに依存せず、管理下のreverse proxyで正規化された`x-forwarded-for` / `x-real-ip`だけを、`TRUST_PROXY_HEADERS=true`の場合に参照する。

Production / PreviewのCompose validationは`config --quiet`を使い、展開済みの環境変数をログへ出力しない。validation失敗時もComposeの標準エラーをそのまま再出力せず、`DATABASE_URL`や`POSTGRES_PASSWORD`などのsecretをログへ漏らさない。`scripts/test-release-security.mjs`がsentinel secretを使って、正常系・必須変数欠落の異常系の双方を回帰検証する。

Production / rollbackのdeployは、`app`起動後にDocker healthcheckがhealthyになるまで待機し、`/api/health`が`status: ok`を返し、対象release SHAと一致した場合だけ成功扱いにする。既定の待機timeoutは120秒で、`RELEASE_HEALTH_TIMEOUT_SECONDS`と`RELEASE_HEALTH_POLL_INTERVAL_SECONDS`で調整できる。`scripts/test-release-health.mjs`がhealthy遷移、unhealthy、timeout、release SHA不一致を回帰検証する。

ユーザーデータのportabilityは`/api/data/export`と`/api/data/import`、`/settings`で提供する。exportはschema version付きで、現在のユーザーに所有されるRoutine / RoutineRevision / RoutineLogだけを含め、password hash / Session / 他ユーザー情報を含めない。exportの3テーブル取得はPostgreSQLのread-only `REPEATABLE READ` transaction内で行い、同一snapshotから一貫したファイルを生成する。importは現在のユーザーの3種類のデータを置換する方針とし、別アカウントへも読み込めるよう内部IDを再発行する。受け入れ前にschema・件数・参照整合性・日付・重複を検証し、DB反映はtransactionで行うため途中失敗時に既存データを残す。認証付きのexport/importはRoutineContextの共通fetch経路を利用し、401時はセッションを無効化してログイン画面へ復帰する。
Settingsにはログイン中のメールアドレスと共通ログアウトボタンを表示し、PCサイドバーとモバイルのSettingsの両方から利用できます。ログアウトボタンは処理中の二重送信を防ぎ、API失敗時は認証状態と既存データを保持したまま共通エラー表示を行います。
