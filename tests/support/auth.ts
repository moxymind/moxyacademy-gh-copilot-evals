import { expect, Page } from "@playwright/test";

export const PASSWORD = "secret_sauce";

export async function loginAs(page: Page, username: string): Promise<void> {
  await page.goto("/");
  await page.locator('[data-test="username"]').fill(username);
  await page.locator('[data-test="password"]').fill(PASSWORD);
  await page.locator('[data-test="login-button"]').click();
  await expect(page).toHaveURL(/inventory/);
}
