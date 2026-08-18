import { expect, test, type Page } from "@playwright/test";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"] as const;

function dateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function register(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "初めて利用する方はこちら" }).click();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText(email)).toBeVisible();
}

async function createRoutine(page: Page, content: string) {
  await page.getByRole("link", { name: "Routines" }).click();
  await page.getByLabel("内容").fill(content);
  await page.getByRole("button", { name: "日", exact: true }).click();
  await page.getByRole("button", { name: "土", exact: true }).click();
  await page.getByRole("button", { name: "追加する" }).click();
  await expect(page.getByText(content)).toBeVisible();
}

async function createRoutineOnDay(page: Page, content: string, dayIndex: number) {
  await page.getByRole("link", { name: "Routines" }).click();
  await page.getByLabel("内容").fill(content);
  for (const [index, day] of weekdays.entries()) {
    const button = page.getByRole("button", { name: day, exact: true });
    const isSelected = await button.evaluate((element) => element.classList.contains("selected"));
    if (isSelected !== (index === dayIndex)) await button.click();
  }
  await page.getByRole("button", { name: "追加する" }).click();
  await expect(page.getByText(content)).toBeVisible();
}

function testClientIp(testId: string, retry: number) {
  let hash = 2166136261;
  for (const character of testId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const high = (hash >>> 16).toString(16);
  const low = (hash & 0xffff).toString(16);
  return `2001:db8:${high}:${low}::${retry + 1}`;
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": testClientIp(testInfo.testId, testInfo.retry) });
});

test("registers, records, edits, disables, and restores an isolated routine flow", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const firstEmail = `e2e-${unique}@example.com`;
  const secondEmail = `e2e-other-${unique}@example.com`;
  const password = "correct-horse-battery-staple";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = dateKey(yesterday);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  await page.getByRole("button", { name: "初めて利用する方はこちら" }).click();
  await page.getByLabel("メールアドレス").fill(firstEmail);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText(firstEmail)).toBeVisible();
  await expect(page.getByRole("heading", { name: "まだルーティーンがありません" })).toBeVisible();
  await expect(page.getByText("毎日続けたいことを登録してみましょう。")).toBeVisible();
  await expect(page.getByRole("link", { name: "最初のルーティーンを追加" })).toBeVisible();
  await page.getByRole("link", { name: "最初のルーティーンを追加" }).click();
  await expect(page.getByRole("heading", { name: "最初のルーティーンを追加" })).toBeVisible();

  await page.goto("/?date=abc");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "今日のルーティーン" })).toBeVisible();
  await page.goto("/?date=2026-02-31");
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("link", { name: "Routines" }).click();
  await page.getByLabel("内容").fill("E2Eで検証する");
  await page.getByLabel("開始日").fill(yesterdayDate);
  await page.getByRole("button", { name: "日", exact: true }).click();
  await page.getByRole("button", { name: "土", exact: true }).click();
  await page.getByRole("button", { name: "追加する" }).click();
  await expect(page.getByText("E2Eで検証する")).toBeVisible();

  await page.goto(`/?date=${yesterdayDate}`);
  const pastRoutineCheck = page.getByRole("button", { name: "E2Eで検証するを完了にする" });
  await expect(pastRoutineCheck).toBeVisible();
  await pastRoutineCheck.click();
  await expect(page.getByRole("button", { name: "E2Eで検証するを未完了に戻す" })).toBeVisible();

  await page.goto("/");
  const routineCheck = page.getByRole("button", { name: "E2Eで検証するを完了にする" });
  await expect(routineCheck).toBeVisible();
  await routineCheck.click();
  await expect(page.getByRole("button", { name: "E2Eで検証するを未完了に戻す" })).toBeVisible();

  await page.getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await page.getByRole("link", { name: /この日の記録を見る/ }).click();
  await expect(page.getByRole("button", { name: "E2Eで検証するを未完了に戻す" })).toBeVisible();
  await page.getByRole("link", { name: "Stats" }).click();
  await expect(page.getByRole("heading", { name: "統計" })).toBeVisible();
  await expect(page.getByText("E2Eで検証する")).toBeVisible();

  await page.getByRole("link", { name: "Routines" }).click();
  const routineRow = page.locator(".managed-row").filter({ hasText: "E2Eで検証する" });
  await routineRow.getByRole("button", { name: /編集/ }).click();
  await page.getByRole("dialog").getByRole("textbox").first().fill("E2Eで編集後");
  await page.getByRole("dialog").getByRole("button", { name: "変更を保存" }).click();
  await expect(page.getByText("E2Eで編集後")).toBeVisible();

  await page.goto(`/?date=${yesterdayDate}`);
  await expect(page.getByRole("button", { name: "E2Eで検証するを未完了に戻す" })).toBeVisible();
  await expect(page.getByText("E2Eで編集後")).toHaveCount(0);
  await page.getByRole("link", { name: "Stats" }).click();
  await page.getByRole("button", { name: "直近30日" }).click();
  const previousStatsRow = page.locator(".stats-row").filter({ hasText: "E2Eで検証する" });
  const currentStatsRow = page.locator(".stats-row").filter({ hasText: "E2Eで編集後" });
  await expect(previousStatsRow).toContainText("1 / 1回");
  await expect(currentStatsRow).toContainText("1 / 1回");

  await page.getByRole("link", { name: "Routines" }).click();
  const editedRow = page.locator(".managed-row").filter({ hasText: "E2Eで編集後" });
  page.on("dialog", (dialog) => dialog.accept());
  await editedRow.getByRole("button", { name: /無効化/ }).click();
  await expect(page.locator(".inactive-section").getByText("E2Eで編集後")).toBeVisible();
  await page.locator(".inactive-section").getByRole("button", { name: /再開/ }).click();
  await expect(page.locator(".inactive-section")).toHaveCount(0);

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  await page.getByLabel("メールアドレス").fill(firstEmail);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByText(firstEmail)).toBeVisible();

  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.getByRole("button", { name: "初めて利用する方はこちら" }).click();
  await page.getByLabel("メールアドレス").fill(secondEmail);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText(secondEmail)).toBeVisible();
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.getByText("E2Eで編集後")).toHaveCount(0);
});

test("clears stale routine data after an authenticated API returns 401", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `e2e-session-${unique}@example.com`;
  const password = "correct-horse-battery-staple";

  await page.goto("/");
  await page.getByRole("button", { name: "初めて利用する方はこちら" }).click();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "登録する" }).click();
  await createRoutine(page, "401から回復する");
  await page.getByRole("link", { name: "Today" }).click();

  await page.route("**/api/routines/*/log", async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "ログインが必要です。" }) });
  });
  await page.getByRole("button", { name: "401から回復するを完了にする" }).click();
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  await expect(page.getByText("401から回復する")).toHaveCount(0);
  await expect(page.locator(".auth-error")).toContainText("セッションの有効期限が切れました");
});

test("clears stale routine data when Settings export returns 401", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `e2e-settings-export-session-${unique}@example.com`;
  const password = "correct-horse-battery-staple";

  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` });
  await register(page, email, password);
  await createRoutine(page, "Exportの401から回復する");
  await page.getByRole("link", { name: "Settings" }).click();
  await page.route("**/api/data/export", async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "ログインが必要です。" }) });
  });
  await page.getByRole("button", { name: "JSONをダウンロード" }).click();
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  await expect(page.getByText("Exportの401から回復する")).toHaveCount(0);
  await expect(page.locator(".auth-error")).toContainText("セッションの有効期限が切れました");
});

test("clears stale routine data when Settings import returns 401", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `e2e-settings-import-session-${unique}@example.com`;
  const password = "correct-horse-battery-staple";

  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` });
  await register(page, email, password);
  await createRoutine(page, "Importの401から回復する");
  await page.getByRole("link", { name: "Settings" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSONをダウンロード" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  await page.locator("#data-import-file").setInputFiles(downloadPath!);
  await expect(page.getByText(/Routine 1件 \/ 履歴 1件 \/ 完了ログ 0件/)).toBeVisible();

  await page.route("**/api/data/import", async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "ログインが必要です。" }) });
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "この内容で置き換える" }).click();
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  await expect(page.getByText("Importの401から回復する")).toHaveCount(0);
  await expect(page.locator(".auth-error")).toContainText("セッションの有効期限が切れました");
});

test("keeps the edited form mounted while retrying a failed save", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `e2e-retry-${unique}@example.com`;
  const password = "correct-horse-battery-staple";

  await register(page, email, password);

  await createRoutine(page, "再試行対象");
  const routineRow = page.locator(".managed-row").filter({ hasText: "再試行対象" });
  await routineRow.getByRole("button", { name: /編集/ }).click();
  const contentInput = page.getByRole("dialog").getByRole("textbox").first();
  await contentInput.fill("再試行しても保持する入力");

  await page.route("**/api/routines/*", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "保存に失敗しました。" }) });
      return;
    }
    await route.continue();
  });
  await page.getByRole("dialog").getByRole("button", { name: "変更を保存" }).click();
  await expect(page.locator(".app-error")).toContainText("保存に失敗しました。");
  await expect(contentInput).toHaveValue("再試行しても保持する入力");

  await page.getByRole("button", { name: "データを再読み込み" }).click();
  await expect(contentInput).toHaveValue("再試行しても保持する入力");
});

test("keeps authentication inputs for a rate-limit retry", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `e2e-rate-limit-${unique}@example.com`;
  const password = "correct-horse-battery-staple";
  let shouldRateLimit = true;

  await page.route("**/api/auth/register", async (route) => {
    if (shouldRateLimit) {
      shouldRateLimit = false;
      await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "登録試行が多すぎます。しばらく待ってから再試行してください。" }) });
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "初めて利用する方はこちら" }).click();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.locator(".auth-error")).toContainText("登録試行が多すぎます");
  await expect(page.getByLabel("メールアドレス")).toHaveValue(email);
  await expect(page.getByLabel("パスワード")).toHaveValue(password);
  await page.getByRole("button", { name: "再送信" }).click();
  await expect(page.getByText(email)).toBeVisible();
});

test("keeps a successful session when the initial routine load temporarily fails", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `e2e-load-retry-${unique}@example.com`;
  const password = "correct-horse-battery-staple";
  let shouldFail = true;

  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` });
  await page.route("**/api/routines", async (route) => {
    if (route.request().method() === "GET" && shouldFail) {
      shouldFail = false;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "一時的にデータを取得できません。" }) });
      return;
    }
    await route.continue();
  });
  await register(page, email, password);
  await expect(page.getByRole("heading", { name: "まだルーティーンがありません" })).toBeVisible();
  await expect(page.locator(".app-error")).toContainText("一時的にデータを取得できません。");
  await expect(page.getByRole("button", { name: "データを再読み込み" })).toBeVisible();
  await page.getByRole("button", { name: "データを再読み込み" }).click();
  await expect(page.getByRole("heading", { name: "まだルーティーンがありません" })).toBeVisible();
});

test("does not show onboarding when a routine exists outside today's schedule", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `e2e-empty-day-${unique}@example.com`;
  const password = "correct-horse-battery-staple";
  const nextDay = (new Date().getDay() + 1) % 7;

  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` });
  await register(page, email, password);
  await createRoutineOnDay(page, "曜日外のルーティーン", nextDay);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "まだルーティーンがありません" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "必ずやる", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "できればやる", exact: true })).toBeVisible();
  await expect(page.getByText("曜日外のルーティーン")).toHaveCount(0);
  await expect(page.getByText("この日の予定はありません。")).toHaveCount(2);
});

test("exports and imports user data from Settings", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `e2e-portability-${unique}@example.com`;
  const password = "correct-horse-battery-staple";

  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` });
  await register(page, email, password);
  await createRoutine(page, "持ち運びするRoutine");
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "データ管理" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSONをダウンロード" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  await page.locator("#data-import-file").setInputFiles(downloadPath!);
  await expect(page.getByText(/Routine 1件 \/ 履歴 1件 \/ 完了ログ 0件/)).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "この内容で置き換える" }).click();
  await expect(page.getByRole("status")).toContainText("1件のRoutine");
  await page.getByRole("link", { name: "Routines" }).click();
  await expect(page.getByText("持ち運びするRoutine")).toBeVisible();
});
