import { expect, test } from "@playwright/test";
import {
  createMovementViaApi,
  createSkuWithToken,
  loginAsAdmin,
  loginViaApi,
  loginWithCredentials,
  registerUserViaApi,
  uniqueText,
} from "./support";

test("admin can see customer and creation workflows", async ({ page }) => {
  await loginAsAdmin(page);

  await expect(page.getByRole("link", { name: "Customers", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "New Sales Order", exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "Products", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Create Product" })).toBeVisible();

  await page.getByRole("link", { name: "Inventory Activity", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Post Movement" })).toBeVisible();
});

test("manager can access sales workspaces but cannot post inventory or manage products", async ({
  page,
  request,
}) => {
  const email = `${uniqueText("manager")}@example.com`;
  const password = "Password123";
  const manager = await registerUserViaApi(request, {
    email,
    password,
    name: "Playwright Manager",
    role: "MANAGER",
  });

  const forbiddenSkuResponse = await request.post("http://127.0.0.1:4010/api/inventory/skus", {
    headers: {
      Authorization: `Bearer ${manager.token}`,
    },
    data: {
      skuCode: `MGR-${uniqueText("sku").toUpperCase()}`,
      productName: "Forbidden Manager Product",
      category: "Permissions",
      unit: "piece",
      unitCost: 10,
      sellingPrice: 20,
      reorderLevel: 2,
      reorderQuantity: 5,
      status: "ACTIVE",
    },
  });
  expect(forbiddenSkuResponse.status()).toBe(403);

  await loginWithCredentials(page, email, password);

  await expect(page.getByRole("link", { name: "Customers", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "New Sales Order", exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "Products", exact: true }).first().click();
  await expect(page.getByText("Product Administration", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Product" })).toHaveCount(0);

  await page.getByRole("link", { name: "Inventory Activity", exact: true }).first().click();
  await expect(
    page.getByText("Only Admin and Warehouse users can post inbound, outbound, or adjustment movements."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Post Movement" })).toHaveCount(0);

  await page.getByRole("link", { name: "Customers", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
});

test("warehouse can execute inventory but cannot access customer or order creation workspaces", async ({
  page,
  request,
}) => {
  const email = `${uniqueText("warehouse")}@example.com`;
  const password = "Password123";
  const warehouse = await registerUserViaApi(request, {
    email,
    password,
    name: "Playwright Warehouse",
    role: "WAREHOUSE",
  });
  const admin = await loginViaApi(request);
  const sku = await createSkuWithToken(request, admin.token, {
    skuCode: `WH-${uniqueText("sku").toUpperCase()}`,
    productName: "Warehouse Permission SKU",
    category: "Permissions",
    warehouseLocation: "WH-01",
  });

  await createMovementViaApi(request, {
    token: admin.token,
    skuId: sku.id,
    movementType: "INBOUND",
    quantity: 3,
    reason: "Seed stock for warehouse permission test",
  });

  const warehouseMovementResponse = await request.post("http://127.0.0.1:4010/api/inventory/movements", {
    headers: {
      Authorization: `Bearer ${warehouse.token}`,
    },
    data: {
      skuId: sku.id,
      movementType: "ADJUSTMENT",
      quantity: 1,
      reason: "Warehouse permission adjustment",
    },
  });
  expect(warehouseMovementResponse.status()).toBe(201);

  const forbiddenCustomerResponse = await request.get("http://127.0.0.1:4010/api/customers?page=1&pageSize=10", {
    headers: {
      Authorization: `Bearer ${warehouse.token}`,
    },
  });
  expect(forbiddenCustomerResponse.status()).toBe(403);

  await loginWithCredentials(page, email, password);

  await expect(page.getByRole("link", { name: "Customers", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "New Sales Order", exact: true })).toHaveCount(0);

  await page.goto("/sales/customers");
  await expect(page.getByRole("heading", { name: "Access Restricted", exact: true })).toBeVisible();

  await page.goto("/sales/orders/new");
  await expect(page.getByRole("heading", { name: "Access Restricted", exact: true })).toBeVisible();

  await page.goto("/inventory/activity");
  await expect(page.getByRole("button", { name: "Post Movement" })).toBeVisible();
});
