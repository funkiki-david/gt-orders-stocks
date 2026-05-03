export const APP_ROLES = ["ADMIN", "MANAGER", "WAREHOUSE"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const CUSTOMER_MANAGER_ROLES: AppRole[] = ["ADMIN", "MANAGER"];
export const SALES_ORDER_MANAGER_ROLES: AppRole[] = ["ADMIN", "MANAGER"];
export const PRODUCT_MANAGER_ROLES: AppRole[] = ["ADMIN", "MANAGER"];
export const INVENTORY_OPERATOR_ROLES: AppRole[] = ["ADMIN", "WAREHOUSE"];
