import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { CustomersPage } from "@/features/customers/CustomersPage";
import { InventoryPage } from "@/features/inventory/InventoryPage";
import { OrdersPage } from "@/features/orders/OrdersPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RequireRoles } from "@/components/RequireRoles";
import { UserManagementPage } from "@/features/users/UserManagementPage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "orders",
        element: <Navigate replace to="/sales/orders" />,
      },
      {
        path: "orders/new",
        element: <Navigate replace to="/sales/orders/new" />,
      },
      {
        path: "customers",
        element: <Navigate replace to="/sales/customers" />,
      },
      {
        path: "customers/new",
        element: <Navigate replace to="/sales/customers/new" />,
      },
      {
        path: "inventory",
        element: <Navigate replace to="/inventory/stock-overview" />,
      },
      {
        path: "sales/orders",
        element: <OrdersPage mode="workspace" />,
      },
      {
        path: "sales/orders/new",
        element: (
          <RequireRoles
            allowedRoles={["ADMIN", "MANAGER"]}
            message="Only Admin and Manager users can create new sales orders."
          >
            <OrdersPage mode="new" />
          </RequireRoles>
        ),
      },
      {
        path: "sales/customers",
        element: (
          <RequireRoles
            allowedRoles={["ADMIN", "MANAGER"]}
            message="Only Admin and Manager users can access customer records."
          >
            <CustomersPage mode="existing" />
          </RequireRoles>
        ),
      },
      {
        path: "sales/customers/new",
        element: (
          <RequireRoles
            allowedRoles={["ADMIN", "MANAGER"]}
            message="Only Admin and Manager users can create customer records."
          >
            <CustomersPage mode="add" />
          </RequireRoles>
        ),
      },
      {
        path: "inventory/products",
        element: <Navigate replace to="/inventory/stock-overview" />,
      },
      {
        path: "inventory/stock-overview",
        element: <InventoryPage mode="products" />,
      },
      {
        path: "inventory/stock-overview/:skuId",
        element: <InventoryPage mode="products" />,
      },
      {
        path: "inventory/activity",
        element: <Navigate replace to="/inventory/activity-log" />,
      },
      {
        path: "inventory/actions",
        element: <InventoryPage mode="actions" />,
      },
      {
        path: "inventory/activity-log",
        element: (
          <RequireRoles
            allowedRoles={["ADMIN", "MANAGER"]}
            message="Only Admin and Manager users can access the full inventory activity log."
          >
            <InventoryPage mode="activity" />
          </RequireRoles>
        ),
      },
      {
        path: "inventory/pallet-locations",
        element: <InventoryPage mode="pallets" />,
      },
      {
        path: "inventory/low-stock",
        element: <Navigate replace to="/inventory/stock-overview" />,
      },
      {
        path: "admin/users",
        element: (
          <RequireRoles
            allowedRoles={["ADMIN"]}
            message="Only Admin users can access user management."
          >
            <UserManagementPage />
          </RequireRoles>
        ),
      },
    ],
  },
]);
