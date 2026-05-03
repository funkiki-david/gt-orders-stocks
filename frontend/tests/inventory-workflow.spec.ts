import { expect, test } from "@playwright/test";
import { loginAsAdmin, uniqueText } from "./support";

test("user can post inbound inventory activity and jump back to the product record", async ({ page, request }) => {
  void request;
  const uniqueReason = `Playwright inbound ${uniqueText("reason")}`;

  await loginAsAdmin(page);
  await page.goto("/inventory/activity");

  const movementForm = page.locator("form").first();
  const skuSelect = movementForm.getByLabel("SKU");
  const firstSkuOption = skuSelect.locator("option").nth(1);
  const firstSkuLabel = (await firstSkuOption.textContent())?.trim();

  expect(firstSkuLabel).toBeTruthy();
  await skuSelect.selectOption({ label: firstSkuLabel! });
  await movementForm.getByLabel("Movement Type").selectOption("INBOUND");
  await movementForm.getByLabel("Quantity").fill("12");
  await movementForm.getByLabel("Reason").fill(uniqueReason);
  await movementForm.getByLabel("Notes").fill("Inventory workflow smoke test");
  await movementForm.getByRole("button", { name: "Post Movement" }).click();

  const movementRow = page.locator("div.px-5.py-4.text-sm").filter({ hasText: uniqueReason }).first();
  await expect(movementRow).toBeVisible();
  await movementRow.getByRole("link", { name: "Open Product" }).click();

  await expect(page).toHaveURL(/\/inventory\/products\?sku=/);
  await expect(page.getByText("Product Record", { exact: true })).toBeVisible();
});
