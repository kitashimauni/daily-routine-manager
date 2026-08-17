# daily-routine-manager

毎日やりたいことを、ワンタップで記録するルーティーン管理アプリです。

## 画面

- `/` — Today：指定日のルーティーン確認と完了記録
- `/calendar` — Calendar：必須ルーティーンを基準にした月間履歴
- `/routines` — Routines：作成・編集・無効化
- `/stats` — Stats：必須 / 任意の期間別・ルーティーン別達成率

## 開発

```bash
pnpm install --ignore-scripts
pnpm dev
```

通常のブラウザでは `http://localhost:3000` を開きます。

現状はDB接続情報がないため、データはブラウザの `localStorage` に保存しています。詳しい移行方針は [`docs/implementation-notes.md`](docs/implementation-notes.md) を参照してください。

## 検証

```bash
pnpm exec tsc --noEmit
pnpm build
```
