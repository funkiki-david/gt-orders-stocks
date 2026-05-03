import { expect, test } from "@playwright/test";
import {
  createMovementViaApi,
  createSkuViaApi,
  loginAsAdmin,
  uniqueText,
} from "./support";

test("customer record and sales order detail preserve customer context", async ({ page, request }) => {
  const customerName = uniqueText("playwright customer");
  const skuCode = uniqueText("ctx-sku").toUpperCase();
  const productName = uniqueText("context product");

  const { auth, sku } = await createSkuViaApi(request, {
    skuCode,
    productName,
    category: "E2E Orders",
    sellingPrice: 32,
  });

  await createMovementViaApi(request, {
    token: auth.token,
    skuId: sku.id,
    movementType: "INBOUND",
    quantity: 20,
    reason: "Playwright stock for order test",
    notes: "Ensures confirm has inventory to reserve.",
  });

  await loginAsAdmin(page);
  await page.goto("/sales/customers");

  const newCustomerForm = page.locator("form").first();

  await newCustomerForm.getByRole("textbox", { name: "Company Name" }).fill(customerName);
  await newCustomerForm.getByRole("textbox", { name: "Email" }).fill(`${customerName}@example.com`);
  await newCustomerForm.getByRole("textbox", { name: "Phone" }).fill("555-0100");
  await newCustomerForm.getByRole("textbox", { name: "Payment Terms" }).fill("Net 15");
  await newCustomerForm.getByLabel("Billing Address").fill("100 Playwright Way");
  await newCustomerForm.getByLabel("Notes").fill("Customer created by Playwright");
  await newCustomerForm.getByRole("button", { name: "Create Customer" }).click();

  await expect(page.getByRole("heading", { name: customerName })).toBeVisible();
  await expect(page.getByText("Sales Distribution")).toBeVisible();
  await expect(page.getByText("$0.00").first()).toBeVisible();

  await page.getByRole("link", { name: "New Sales Order" }).click();
  await expect(page.getByRole("heading", { name: "New Sales Order" })).toBeVisible();

  const draftBuilderForm = page.locator("form").first();
  await draftBuilderForm.getByLabel("Customer").selectOption({ label: customerName });
  await draftBuilderForm.getByLabel("SKU").selectOption({ label: `${skuCode} · ${productName}` });
  await draftBuilderForm.getByLabel("Quantity").fill("2");
  await draftBuilderForm.getByLabel("Unit Price").fill("32");
  await draftBuilderForm.getByLabel("Notes").fill("Playwright customer context order");
  await draftBuilderForm.getByRole("button", { name: "Create Draft Order" }).click();

  await page.getByRole("link", { name: "Customers" }).click();
  await page.getByRole("textbox", { name: "Search" }).fill(customerName);
  await page.getByRole("button", { name: customerName }).click();

  await expect(page.getByText("Recent Sales Orders")).toBeVisible();
  await page.getByRole("link", { name: "Open Order" }).first().click();

  await expect(page).toHaveURL(/\/sales\/orders\?.*from=customer/);
  await expect(page.getByRole("link", { name: "Back to Customer Record" }).first()).toBeVisible();
  await expect(page.getByText("Customer context is active for this order queue.")).toBeVisible();

  await page.getByRole("button", { name: "Confirm Order" }).click();
  await expect(page.getByText("Reserve is active. Continue from Inventory Activity with linked outbound shipment.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Order" })).toHaveCount(0);

  await page.getByRole("link", { name: "Back to Customer Record" }).first().click();
  await expect(page).toHaveURL(/\/sales\/customers\?selected=/);
  await expect(page.getByRole("heading", { name: customerName })).toBeVisible();
  await expect(page.getByText("$64.00").first()).toBeVisible();
});
