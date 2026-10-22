import { test, expect } from "@playwright/test";

import { loginAs } from "../support/auth";

test.describe("TC-004: Checkout validates required fields and completes the order", () => {
  test("should validate required fields and complete checkout", async ({ page }) => {
    await loginAs(page, "standard_user");
    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();

    await page.locator('[data-test="shopping-cart-link"]').click();
    await page.locator('[data-test="checkout"]').click();
    await expect(page.locator('[data-test="title"]')).toHaveText("Checkout: Your Information");

    const error = page.locator('[data-test="error"]');
    const continueButton = page.locator('[data-test="continue"]');

    await continueButton.click();
    await expect(error).toHaveText("Error: First Name is required");

    await page.locator('[data-test="firstName"]').fill("John");
    await continueButton.click();
    await expect(error).toHaveText("Error: Last Name is required");

    await page.locator('[data-test="lastName"]').fill("Doe");
    await continueButton.click();
    await expect(error).toHaveText("Error: Postal Code is required");

    await page.locator('[data-test="postalCode"]').fill("12345");
    await continueButton.click();
    await expect(page.locator('[data-test="title"]')).toHaveText("Checkout: Overview");
    await expect(page.locator('[data-test="inventory-item-name"]')).toHaveText("Sauce Labs Backpack");
    await expect(page.locator('[data-test="subtotal-label"]')).toHaveText("Item total: $29.99");

    await page.locator('[data-test="finish"]').click();
    await expect(page.locator('[data-test="complete-header"]')).toHaveText("Thank you for your order!");
    await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveCount(0);
  });
});
