import { test, expect } from "@playwright/test";

import { loginAs } from "../support/auth";

test.describe("TC-003: Sort products by price, low to high", () => {
  test("should sort products by price ascending", async ({ page }) => {
    await loginAs(page, "standard_user");

    const sortSelect = page.locator('[data-test="product-sort-container"]');
    await sortSelect.selectOption("lohi");
    await expect(page.locator('[data-test="active-option"]')).toHaveText("Price (low to high)");

    const priceTexts = await page.locator('[data-test="inventory-item-price"]').allTextContents();
    const prices = priceTexts.map((text) => Number(text.replace("$", "")));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));

    const names = page.locator('[data-test="inventory-item-name"]');
    const priceLocators = page.locator('[data-test="inventory-item-price"]');
    await expect(names.first()).toHaveText("Sauce Labs Onesie");
    await expect(priceLocators.first()).toHaveText("$7.99");
    await expect(names.last()).toHaveText("Sauce Labs Fleece Jacket");
    await expect(priceLocators.last()).toHaveText("$49.99");
  });
});
