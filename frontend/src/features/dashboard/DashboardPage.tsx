import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import type { DashboardSummary, InventoryMovement, SalesOrderSummary } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { canCreateSalesOrders, canPostInventoryMovements, getCurrentRole } from "@/lib/permissions";

type PagedResponse<T> = {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

export function DashboardPage() {
  const role = getCurrentRole();
  const canCreateOrders = canCreateSalesOrders(role);
  const canOperateInventory = canPostInventoryMovements(role);
  const canViewActivityLog = role === "ADMIN" || role === "MANAGER";
  const dashboardQuery = useQuery({
    queryKey: ["inventory-dashboard"],
    queryFn: () => apiFetch<DashboardSummary>("/inventory/dashboard"),
  });

  const recentOrdersQuery = useQuery({
    queryKey: ["dashboard-recent-orders"],
    queryFn: () =>
      apiFetch<PagedResponse<SalesOrderSummary>>(
        "/sales/orders?page=1&pageSize=5&sortBy=updatedAt&sortDirection=desc",
      ),
  });

  const recentMovements = dashboardQuery.data?.recentMovements ?? [];
  const recentOrders = recentOrdersQuery.data?.items ?? [];

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Daily Workflow</h3>
          <div className="mt-4 space-y-4 text-sm text-neutral-600">
            <WorkflowStep
              actionLabel="Find Stock"
              body="Search the SKU first and confirm available quantity before touching the physical stock."
              title="1. Find the stock"
              to="/inventory/stock-overview"
            />
            <WorkflowStep
              actionLabel="Open Actions"
              body="Use one action screen for receiving, adjusting, moving, or shipping inventory."
              title="2. Do the action"
              to="/inventory/actions"
            />
            <WorkflowStep
              actionLabel="Check Pallet"
              body="Open the pallet location only when you need to confirm what is sitting in a location."
              title="3. Check the pallet"
              to="/inventory/pallet-locations"
            />
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Fast Links</h3>
          <div className="mt-4 grid gap-3">
            {canCreateOrders ? (
              <QuickLinkCard actionLabel="Create" description="Create and save a new multi-line draft document." to="/sales/orders/new">
                Create Sales Order
              </QuickLinkCard>
            ) : null}
            {canOperateInventory ? (
              <QuickLinkCard actionLabel="Open Actions" description="Post outbound, inbound, transfer, and adjustment movement records." to="/inventory/actions">
                Inventory Actions
              </QuickLinkCard>
            ) : null}
            <QuickLinkCard actionLabel="Review Stock" description="Review product records, quantities, and movement history." to="/inventory/stock-overview">
              Review Stock
            </QuickLinkCard>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold">Recent Activity</h3>
        <div className="mt-4 grid gap-5 xl:grid-cols-2">
          <ActivityPanel actionLabel="Open Orders" title="Recent Orders" to="/sales/orders">
            {recentOrders.slice(0, 5).map((order) => (
              <OrderActivityRow key={order.id} order={order} />
            ))}
            {!recentOrders.length ? <EmptyActivityRow>No recent orders yet.</EmptyActivityRow> : null}
          </ActivityPanel>

          <ActivityPanel
            actionLabel="Open Activity"
            title="Inventory Movements"
            to={canViewActivityLog ? "/inventory/activity-log" : "/inventory/stock-overview"}
          >
            {recentMovements.slice(0, 5).map((movement) => (
              <MovementActivityRow key={movement.id} movement={movement} />
            ))}
            {!recentMovements.length ? <EmptyActivityRow>No recent movements yet.</EmptyActivityRow> : null}
          </ActivityPanel>
        </div>
      </div>
    </section>
  );
}

function ActivityPanel({
  actionLabel,
  children,
  title,
  to,
}: {
  actionLabel: string;
  children: React.ReactNode;
  title: string;
  to: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
        <h4 className="font-semibold text-neutral-900">{title}</h4>
        <Link
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 shadow-sm transition-colors hover:bg-green-50 hover:text-green-800"
          to={to}
        >
          {actionLabel}
        </Link>
      </div>
      <div className="divide-y divide-neutral-200">{children}</div>
    </div>
  );
}

function OrderActivityRow({ order }: { order: SalesOrderSummary }) {
  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-neutral-900">{order.soNumber}</p>
          <p className="mt-1 truncate text-neutral-500">{order.customerCompanyName ?? "No customer"}</p>
          <p className="mt-1 text-xs text-neutral-400">{new Date(order.updatedAt).toLocaleString()}</p>
        </div>
        <div className="shrink-0 text-right">
          <StatusBadge>{order.status}</StatusBadge>
          <p className="mt-2 font-semibold text-neutral-800">${order.totalAmount}</p>
        </div>
      </div>
    </div>
  );
}

function MovementActivityRow({ movement }: { movement: InventoryMovement }) {
  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-neutral-900">
            {movement.skuCode} · {movement.productName}
          </p>
          <p className="mt-1 truncate text-neutral-500">{movement.reason ?? "No reason"}</p>
          <p className="mt-1 text-xs text-neutral-400">{new Date(movement.createdAt).toLocaleString()}</p>
        </div>
        <div className="shrink-0 text-right">
          <StatusBadge>{movement.movementType}</StatusBadge>
          <p className="mt-2 font-semibold text-neutral-800">{movement.quantity}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyActivityRow({ children }: { children: string }) {
  return <div className="px-4 py-5 text-sm text-neutral-500">{children}</div>;
}

function WorkflowStep({
  actionLabel,
  body,
  title,
  to,
}: {
  actionLabel: string;
  body: string;
  title: string;
  to: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-neutral-800">{title}</p>
        <p className="mt-1">{body}</p>
      </div>
      <Link
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 shadow-sm transition-colors hover:bg-green-50 hover:text-green-800"
        to={to}
      >
        {actionLabel}
      </Link>
    </div>
  );
}

function QuickLinkCard({
  actionLabel,
  children,
  description,
  to,
}: {
  actionLabel: string;
  children: string;
  description: string;
  to: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-neutral-200 px-4 py-3 transition-colors hover:border-green-200 hover:bg-green-50 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{children}</p>
        <p className="mt-1 text-sm text-neutral-500">{description}</p>
      </div>
      <Link
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 shadow-sm transition-colors hover:bg-green-50 hover:text-green-800"
        to={to}
      >
        {actionLabel}
      </Link>
    </div>
  );
}
