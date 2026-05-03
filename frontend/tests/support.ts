import { expect, type APIRequestContext, type Page } from "@playwright/test";

const BACKEND_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:4010/api";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@gt.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin123";

type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    name?: string;
    role: "ADMIN" | "MANAGER" | "WAREHOUSE";
  };
};

type CustomerPayload = {
  companyName: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  notes?: string;
  paymentTerms?: string;
};

type SkuPayload = {
  skuCode: string;
  productName: string;
  category: string;
  unit?: string;
  unitCost?: number;
  sellingPrice?: number;
  reorderLevel?: number;
  reorderQuantity?: number;
  warehouseLocation?: string;
};

type OrderLinePayload = {
  skuId: string;
  quantityOrdered: number;
  unitPrice: number;
};

export function uniqueText(prefix: string) {
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${safePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loginAsAdmin(page: Page) {
  await loginWithCredentials(page, ADMIN_EMAIL, ADMIN_PASSWORD);
}

export async function loginWithCredentials(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "GT Orders & Stocks" })).toBeVisible();
}

export async function loginViaApi(request: APIRequestContext) {
  return loginViaApiWithCredentials(request, ADMIN_EMAIL, ADMIN_PASSWORD);
}

export async function loginViaApiWithCredentials(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const response = await request.post(`${BACKEND_URL}/auth/login`, {
    data: {
      email,
      password,
    },
  });

  expect(response.ok()).toBeTruthy();
  return (await response.json()) as LoginResponse;
}

export async function registerUserViaApi(
  request: APIRequestContext,
  input: {
    email: string;
    password: string;
    name: string;
    role: "ADMIN" | "MANAGER" | "WAREHOUSE";
  },
) {
  const response = await request.post(`${BACKEND_URL}/auth/register`, {
    data: input,
  });

  expect(response.ok()).toBeTruthy();
  return (await response.json()) as LoginResponse;
}

export async function createCustomerViaApi(request: APIRequestContext, input: CustomerPayload) {
  const auth = await loginViaApi(request);
  return createCustomerWithToken(request, auth.token, input);
}

export async function createCustomerWithToken(
  request: APIRequestContext,
  token: string,
  input: CustomerPayload,
) {
  const response = await request.post(`${BACKEND_URL}/customers`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      paymentTerms: "Net 30",
      ...input,
    },
  });

  expect(response.ok()).toBeTruthy();
  return await response.json();
}

export async function createSkuViaApi(request: APIRequestContext, input: SkuPayload) {
  const auth = await loginViaApi(request);
  return createSkuWithToken(request, auth.token, input).then((sku) => ({ auth, sku }));
}

export async function createSkuWithToken(request: APIRequestContext, token: string, input: SkuPayload) {
  const response = await request.post(`${BACKEND_URL}/inventory/skus`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      unit: "piece",
      unitCost: 12,
      sellingPrice: 24,
      reorderLevel: 5,
      reorderQuantity: 25,
      warehouseLocation: "A-01",
      ...input,
    },
  });

  expect(response.ok()).toBeTruthy();
  return await response.json();
}

export async function createMovementViaApi(
  request: APIRequestContext,
  input: {
    token?: string;
    skuId: string;
    movementType: "INBOUND" | "OUTBOUND" | "ADJUSTMENT";
    quantity: number;
    reason?: string;
    notes?: string;
    referenceType?: "SALES_ORDER" | "PHYSICAL_COUNT" | "OTHER";
    referenceId?: string;
  },
) {
  const auth = input.token ? { token: input.token } : await loginViaApi(request);
  const response = await request.post(`${BACKEND_URL}/inventory/movements`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
    data: input,
  });

  expect(response.ok()).toBeTruthy();
  return await response.json();
}

export async function createOrderViaApi(
  request: APIRequestContext,
  input: {
    token?: string;
    customerId: string;
    notes?: string;
    lines: OrderLinePayload[];
  },
) {
  const auth = input.token ? { token: input.token } : await loginViaApi(request);
  const response = await request.post(`${BACKEND_URL}/sales/orders`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
    data: {
      customerId: input.customerId,
      notes: input.notes,
      lines: input.lines,
    },
  });

  expect(response.ok()).toBeTruthy();
  return await response.json();
}

export async function confirmOrderViaApi(
  request: APIRequestContext,
  input: {
    token?: string;
    orderId: string;
  },
) {
  const auth = input.token ? { token: input.token } : await loginViaApi(request);
  const response = await request.post(`${BACKEND_URL}/sales/orders/${input.orderId}/confirm`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
    data: {},
  });

  expect(response.ok()).toBeTruthy();
  return await response.json();
}

export async function getOrderViaApi(
  request: APIRequestContext,
  input: {
    token?: string;
    orderId: string;
  },
) {
  const auth = input.token ? { token: input.token } : await loginViaApi(request);
  const response = await request.get(`${BACKEND_URL}/sales/orders/${input.orderId}`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  });

  expect(response.ok()).toBeTruthy();
  return await response.json();
}
