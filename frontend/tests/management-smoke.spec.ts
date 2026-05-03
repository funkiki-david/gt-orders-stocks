import { expect, test } from "@playwright/test";
import {
  createCustomerWithToken,
  createSkuWithToken,
  loginAsAdmin,
  loginViaApi,
  uniqueText,
} from "./support";

test("management smoke suite keeps dashboard, low stock, customers, and products reachable", async ({
  page,
  request,
}) => {
  const auth = await loginViaApi(request);
  const customerName = uniqueText("smoke customer");
  const skuCode = `000-${uniqueText("smoke-sku").toUpperCase()}`;
  const productName = uniqueText("smoke product");

  await createCustomerWithToken(request, auth.token, {
    companyName: customerName,
    email: `${customerName}@example.com`,
    notes: "Smoke suite customer",
  });

  await createSkuWithToken(request, auth.token, {
    skuCode,
    productName,
    category: "E2E Smoke",
    sellingPrice: 14,
    reorderLevel: 999,
    reorderQuantity: 100,
    warehouseLocation: "SMK-01",
  });

  await loginAsAdmin(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Business Control Center" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales Pipeline" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Low Stock Watchlist" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Inventory Activity" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Suggested Workflow" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fast Links" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open Low Stock/i })).toBeVisible();

  await page.getByRole("link", { name: "Low Stock", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Low Stock", exact: true })).toBeVisible();
  await expect(page.getByText(skuCode)).toBeVisible();

  await page.getByRole("link", { name: "Products", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Products", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search" }).fill(skuCode);
  await page.locator("button").filter({ hasText: skuCode }).first().click();
  await expect(page.getByRole("heading", { name: skuCode })).toBeVisible();

  await page.getByRole("link", { name: "Customers", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search" }).fill(customerName);
  await page.getByRole("button", { name: customerName }).click();
  await expect(page.getByRole("heading", { name: customerName })).toBeVisible();
  await expect(page.getByText("Customer Record", { exact: true })).toBeVisible();
});
