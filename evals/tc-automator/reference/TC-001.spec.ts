import { test, expect } from "@playwright/test";

import { PASSWORD } from "../support/auth";

test.describe("TC-001: Locked-out user cannot log in", () => {
  test("should show error for locked out user", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-test="username"]').fill("locked_out_user");
    await expect(page.locator('[data-test="username"]')).toHaveValue("locked_out_user");

    await page.locator('[data-test="password"]').fill(PASSWORD);
    await expect(page.locator('[data-test="password"]')).toHaveAttribute("type", "password");

    await page.locator('[data-test="login-button"]').click();
    await expect(page.locator('[data-test="error"]')).toHaveText(
      "Epic sadface: Sorry, this user has been locked out.",
    );

    await expect(page).not.toHaveURL(/inventory/);
    await expect(page.locator('[data-test="login-button"]')).toBeVisible();
  });
});
