import { getAuthSession } from "@/lib/auth";

export type AppRole = "ADMIN" | "MANAGER" | "WAREHOUSE";

export function getCurrentRole(): AppRole | null {
  return getAuthSession()?.user.role ?? null;
}

export function canViewCustomers(role: AppRole | null) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canManageCustomers(role: AppRole | null) {
  return canViewCustomers(role);
}

export function canManageSalesOrders(role: AppRole | null) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canCreateSalesOrders(role: AppRole | null) {
  return canManageSalesOrders(role);
}

export function canManageProducts(role: AppRole | null) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canPostInventoryMovements(role: AppRole | null) {
  return role === "ADMIN" || role === "WAREHOUSE";
}
