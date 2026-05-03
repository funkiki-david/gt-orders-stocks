import { expect, test } from "@playwright/test";
import {
  confirmOrderViaApi,
  createCustomerWithToken,
  createMovementViaApi,
  createOrderViaApi,
  createSkuWithToken,
  getOrderViaApi,
  loginAsAdmin,
  loginViaApi,
  uniqueText,
} from "./support";

test("confirmed sales order can be fulfilled through linked outbound and ends as shipped", async ({
  page,
  request,
}) => {
  const auth = await loginViaApi(request);
  const customerName = uniqueText("fulfillment customer");
  const skuCode = `000-${uniqueText("fulfillment-sku").toUpperCase()}`;
  const productName = uniqueText("fulfillment product");
  const outboundReason = `Playwright linked outbound ${uniqueText("reason")}`;

  const customer = await createCustomerWithToken(request, auth.token, {
    companyName: customerName,
    email: `${customerName}@example.com`,
    paymentTerms: "Net 15",
  });

  const sku = await createSkuWithToken(request, auth.token, {
    skuCode,
    productName,
    category: "E2E Fulfillment",
    sellingPrice: 28,
    reorderLevel: 2,
    reorderQuantity: 8,
    warehouseLocation: "SHIP-01",
  });

  await createMovementViaApi(request, {
    token: auth.token,
    skuId: sku.id,
    movementType: "INBOUND",
    quantity: 5,
    reason: "Seed stock for linked outbound",
  });

  const order = await createOrderViaApi(request, {
    token: auth.token,
    customerId: customer.id,
    notes: "Playwright fulfillment order",
    lines: [
      {
        skuId: sku.id,
        quantityOrdered: 5,
        unitPrice: 28,
      },
    ],
  });

  const confirmedOrder = await confirmOrderViaApi(request, {
    token: auth.token,
    orderId: order.id,
  });

  await loginAsAdmin(page);
  await page.goto("/inventory/activity");

  const movementForm = page.locator("form").first();
  await movementForm.getByLabel("SKU").selectOption({ label: `${skuCode} · ${productName}` });
  await movementForm.getByLabel("Movement Type").selectOption("OUTBOUND");
  await movementForm.getByLabel("Quantity").fill("5");
  await movementForm.getByLabel("Reference Type").selectOption("SALES_ORDER");
  await movementForm
    .getByLabel("Confirmed Sales Order")
    .selectOption({ label: `${confirmedOrder.soNumber} · ${customerName}` });
  await movementForm.getByLabel("Reason").fill(outboundReason);
  await movementForm.getByLabel("Notes").fill("Playwright shipped workflow");
  await movementForm.getByRole("button", { name: "Post Movement" }).click();

  const movementRow = page.locator("div.px-5.py-4.text-sm").filter({ hasText: outboundReason }).first();
  await expect(movementRow).toBeVisible();
  await expect(movementRow.getByText("SALES_ORDER", { exact: true })).toBeVisible();
  await movementRow.getByRole("link", { name: "Open Sales Order" }).click();

  await expect(page).toHaveURL(new RegExp(`/sales/orders\\?selected=${confirmedOrder.id}`));
  await expect(
    page.getByText("This order has completed shipment. Review reservations and audit history if needed."),
  ).toBeVisible();
  await expect(page.getByText("SHIPPED", { exact: true }).first()).toBeVisible();

  const shippedOrder = await getOrderViaApi(request, {
    token: auth.token,
    orderId: confirmedOrder.id,
  });

  expect(shippedOrder.status).toBe("SHIPPED");
  expect(
    shippedOrder.reservations.every(
      (reservation: { status: string; quantityReserved: number }) =>
        reservation.status === "RELEASED" && reservation.quantityReserved === 0,
    ),
  ).toBeTruthy();
});
