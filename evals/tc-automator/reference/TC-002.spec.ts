import { test, expect } from "@playwright/test";

import { loginAs } from "../support/auth";

test.describe("TC-002: Cart badge reflects added and removed items", () => {
  test("should update cart badge when adding and removing items", async ({ page }) => {
    await loginAs(page, "standard_user");
    const cartBadge = page.locator('[data-test="shopping-cart-badge"]');

    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
    await expect(cartBadge).toHaveText("1");

    await page.locator('[data-test="add-to-cart-sauce-labs-bike-light"]').click();
    await expect(cartBadge).toHaveText("2");

    await page.locator('[data-test="remove-sauce-labs-backpack"]').click();
    await expect(cartBadge).toHaveText("1");
    await expect(page.locator('[data-test="add-to-cart-sauce-labs-backpack"]')).toBeVisible();

    await page.locator('[data-test="shopping-cart-link"]').click();
    await expect(page.locator('[data-test="inventory-item"]')).toHaveCount(1);
    await expect(page.locator('[data-test="inventory-item-name"]')).toHaveText("Sauce Labs Bike Light");
  });
});
