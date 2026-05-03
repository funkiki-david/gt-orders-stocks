import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./support";

test("admin can sign in and move across the main workspaces", async ({ page }) => {
  await loginAsAdmin(page);

  await expect(page.getByRole("heading", { name: "Business Control Center" })).toBeVisible();

  await page.getByRole("link", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();

  await page.getByRole("link", { name: "Products" }).click();
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();

  await page.getByRole("link", { name: "Inventory Activity" }).click();
  await expect(page.getByRole("heading", { name: "Inventory Activity" })).toBeVisible();

  await page.getByRole("link", { name: "Sales Orders" }).click();
  await expect(page.getByRole("heading", { name: "Sales Orders" })).toBeVisible();
});
