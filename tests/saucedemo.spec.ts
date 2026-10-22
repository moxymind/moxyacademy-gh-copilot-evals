import { test, expect } from "@playwright/test";

import { loginAs } from "./support/auth";

test.describe("Saucedemo", () => {
  test("should add item to cart", async ({ page }) => {
    await loginAs(page, "standard_user");

    await expect(page.locator('[data-test="title"]')).toHaveText("Products");
    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();

    await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText("1");
  });

  test("should complete checkout flow", async ({ page }) => {
    await loginAs(page, "standard_user");

    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
    await page.locator('[data-test="shopping-cart-link"]').click();
    await expect(page).toHaveURL(/cart/);

    await page.locator('[data-test="checkout"]').click();
    await page.locator('[data-test="firstName"]').fill("John");
    await page.locator('[data-test="lastName"]').fill("Doe");
    await page.locator('[data-test="postalCode"]').fill("12345");
    await page.locator('[data-test="continue"]').click();
    await page.locator('[data-test="finish"]').click();

    await expect(page).toHaveURL(/checkout-complete/);
    await expect(page.locator('[data-test="complete-header"]')).toHaveText("Thank you for your order!");
  });
});
