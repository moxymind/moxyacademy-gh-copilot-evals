import { test, expect } from "@playwright/test";

import { loginAs } from "../support/auth";

test.describe("TC-005: Checkout overview shows the correct price summary", () => {
  test("should show correct price summary on checkout overview", async ({ page }) => {
    await loginAs(page, "standard_user");
    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();

    await page.locator('[data-test="shopping-cart-link"]').click();
    await page.locator('[data-test="checkout"]').click();
    await expect(page.locator('[data-test="title"]')).toHaveText("Checkout: Your Information");

    await page.locator('[data-test="firstName"]').fill("John");
    await page.locator('[data-test="lastName"]').fill("Doe");
    await page.locator('[data-test="postalCode"]').fill("12345");
    await page.locator('[data-test="continue"]').click();
    await expect(page.locator('[data-test="title"]')).toHaveText("Checkout: Overview");

    await expect(page.locator('[data-test="subtotal-label"]')).toHaveText("Item total: $29.99");
    await expect(page.locator('[data-test="tax-label"]')).toHaveText("Tax: $2.40");
    // Manual TC expects $35.39; the app shows $32.39 (29.99 + 2.40). Kept as specified, reported as a TC/app mismatch.
    await expect(page.locator('[data-test="total-label"]')).toHaveText("Total: $35.39");
  });
});
