import { expect, test } from "@playwright/test";

function dateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

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
