import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import type { Customer, CustomerSalesSummary, SalesOrderSummary } from "@/lib/types";
import { canViewCustomers, getCurrentRole } from "@/lib/permissions";
import { AccessDeniedPanel } from "@/components/AccessDeniedPanel";

type PagedResponse<T> = {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

type CustomerFormState = {
  companyName: string;
  email: string;
  phone: string;
  billingAddress: string;
  notes: string;
  paymentTerms: string;
};

const emptyCustomerForm: CustomerFormState = {
  companyName: "",
  email: "",
  phone: "",
  billingAddress: "",
  notes: "",
  paymentTerms: "Net 30",
};

type CustomersPageProps = {
  mode?: "add" | "existing";
};

export function CustomersPage({ mode = "existing" }: CustomersPageProps) {
  const role = getCurrentRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCustomerParam = searchParams.get("selected") ?? "";
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [error, setError] = useState("");
  const [newCustomerForm, setNewCustomerForm] = useState<CustomerFormState>(emptyCustomerForm);

  const customersQuery = useQuery({
    queryKey: ["customers-page", search, page, pageSize],
    queryFn: () =>
      apiFetch<PagedResponse<Customer>>(
        `/customers?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`,
      ),
    enabled: mode === "existing",
  });

  const selectedCustomerQuery = useQuery({
    queryKey: ["customer-detail", selectedCustomerId],
    queryFn: () => apiFetch<Customer>(`/customers/${selectedCustomerId}`),
    enabled: mode === "existing" && Boolean(selectedCustomerId),
  });

  const customerOrdersQuery = useQuery({
    queryKey: ["customer-orders", selectedCustomerId],
    queryFn: () =>
      apiFetch<PagedResponse<SalesOrderSummary>>(
        `/sales/orders?page=1&pageSize=6&customerId=${selectedCustomerId}&sortBy=updatedAt&sortDirection=desc`,
      ),
    enabled: mode === "existing" && Boolean(selectedCustomerId),
  });

  const customerSummaryQuery = useQuery({
    queryKey: ["customer-summary", selectedCustomerId],
    queryFn: () => apiFetch<CustomerSalesSummary>(`/customers/${selectedCustomerId}/summary`),
    enabled: mode === "existing" && Boolean(selectedCustomerId),
  });

  useEffect(() => {
    if (mode !== "existing") {
      return;
    }

    if (selectedCustomerParam && selectedCustomerParam !== selectedCustomerId) {
      setSelectedCustomerId(selectedCustomerParam);
      return;
    }

    if (!selectedCustomerId && customersQuery.data?.items.length) {
      setSelectedCustomerId(customersQuery.data.items[0].id);
    }
  }, [customersQuery.data, mode, selectedCustomerId, selectedCustomerParam]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const createCustomerMutation = useMutation({
    mutationFn: async () =>
      apiFetch<Customer>("/customers", {
        method: "POST",
        body: JSON.stringify({
          ...newCustomerForm,
          email: newCustomerForm.email || undefined,
          phone: newCustomerForm.phone || undefined,
          billingAddress: newCustomerForm.billingAddress || undefined,
          notes: newCustomerForm.notes || undefined,
        }),
      }),
    onSuccess: async (customer) => {
      setError("");
      setNewCustomerForm(emptyCustomerForm);
      setSelectedCustomerId(customer.id);
      await queryClient.invalidateQueries({ queryKey: ["customers-page"] });
      await queryClient.invalidateQueries({ queryKey: ["customer-detail"] });
      navigate(`/sales/customers?selected=${customer.id}`);
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Could not create customer");
    },
  });

  const selectedCustomer = selectedCustomerQuery.data;
  const recentOrders = customerOrdersQuery.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((customersQuery.data?.pagination.total ?? 0) / pageSize));

  function handleCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createCustomerMutation.mutate();
  }

  if (!canViewCustomers(role)) {
    return <AccessDeniedPanel message="Only Admin and Manager users can access customer records." />;
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{mode === "add" ? "Add Customer" : "Existing Customers"}</h2>
        <p className="text-sm text-neutral-500">
          {mode === "add"
            ? "Create a new customer profile before entering a sales order."
            : "Review existing customer accounts and jump into each customer's order history."}
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {customersQuery.isLoading && mode === "existing" ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
          Loading customers...
        </div>
      ) : null}
      {customersQuery.isError && mode === "existing" ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load customer records from the database.
        </div>
      ) : null}

      {mode === "add" ? (
        <form className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm" onSubmit={handleCreateCustomer}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Add Customer</p>
              <h3 className="mt-2 text-xl font-semibold">Customer Information</h3>
              <p className="mt-1 text-sm text-neutral-500">Add the customer record before creating an order.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                to="/sales/customers"
              >
                Existing Customers
              </Link>
              <button
                className="rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-60"
                disabled={createCustomerMutation.isPending}
                type="submit"
              >
                {createCustomerMutation.isPending ? "Creating..." : "Create Customer"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InputField label="Company Name" onChange={(value) => setNewCustomerForm((current) => ({ ...current, companyName: value }))} value={newCustomerForm.companyName} />
            <InputField label="Email" onChange={(value) => setNewCustomerForm((current) => ({ ...current, email: value }))} value={newCustomerForm.email} />
            <InputField label="Phone" onChange={(value) => setNewCustomerForm((current) => ({ ...current, phone: value }))} value={newCustomerForm.phone} />
            <InputField label="Payment Terms" onChange={(value) => setNewCustomerForm((current) => ({ ...current, paymentTerms: value }))} value={newCustomerForm.paymentTerms} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <TextAreaField
              label="Billing Address"
              onChange={(value) => setNewCustomerForm((current) => ({ ...current, billingAddress: value }))}
              value={newCustomerForm.billingAddress}
            />
            <TextAreaField
              label="Notes"
              onChange={(value) => setNewCustomerForm((current) => ({ ...current, notes: value }))}
              value={newCustomerForm.notes}
            />
          </div>
        </form>
      ) : null}

      {mode === "existing" ? (
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-neutral-200 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Existing Customers</p>
            <h3 className="mt-2 text-xl font-semibold">Customer Accounts</h3>
            <p className="text-sm text-neutral-500">{customersQuery.data?.pagination.total ?? 0} customers in the current filter.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Search</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Company or email"
                value={search}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Page Size</span>
              <select
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setPageSize(Number(event.target.value))}
                value={pageSize}
              >
                <option value="8">8</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
            </label>
          </div>
        </div>

        <div className="grid xl:grid-cols-[340px_1fr]">
          <div className="border-b border-neutral-200 xl:border-b-0 xl:border-r">
            <div className="divide-y divide-neutral-200">
              {customersQuery.data?.items.map((customer) => (
                <button
                  key={customer.id}
                  className={[
                    "w-full px-5 py-4 text-left transition-all hover:bg-neutral-50",
                    selectedCustomerId === customer.id
                      ? "bg-[linear-gradient(135deg,#f3faf3_0%,#e8f4e8_100%)] ring-1 ring-inset ring-green-200"
                      : "bg-white",
                  ].join(" ")}
                  onClick={() => {
                    setSelectedCustomerId(customer.id);
                    setSearchParams((current) => {
                      const next = new URLSearchParams(current);
                      next.set("selected", customer.id);
                      return next;
                    });
                  }}
                  type="button"
                >
                  <p className="font-semibold">{customer.companyName}</p>
                  <p className="mt-1 truncate text-sm text-neutral-500">{customer.email ?? "No email"}</p>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm text-neutral-500">
                    <span className="truncate">{customer.phone ?? "No phone"}</span>
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold">{customer.paymentTerms}</span>
                  </div>
                </button>
              ))}
              {!customersQuery.data?.items.length ? (
                <div className="px-5 py-6 text-sm text-neutral-500">No customers match the current search.</div>
              ) : null}
            </div>
            <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-4 text-sm">
              <p className="text-neutral-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  className="rounded-md border border-neutral-300 px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="rounded-md border border-neutral-300 px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="p-5">
            {selectedCustomer ? (
              <div className="space-y-5">
                <div className="rounded-lg border border-neutral-200 bg-[linear-gradient(135deg,#f8faf7_0%,#eef4ec_100%)] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Customer Record</p>
                  <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <h3 className="text-2xl font-semibold">{selectedCustomer.companyName}</h3>
                      <p className="mt-2 text-sm text-neutral-600">
                        {selectedCustomer.email ?? "No email"} · {selectedCustomer.phone ?? "No phone"}
                      </p>
                    </div>
                    <Link
                      className="inline-flex items-center justify-center rounded-full border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 shadow-sm hover:bg-green-50"
                      to={`/sales/orders?customer=${selectedCustomer.id}&from=customer`}
                    >
                      View Orders
                    </Link>
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-200 bg-white p-5">
                    {customerSummaryQuery.data ? (
                      <div className="mb-5 grid gap-3 md:grid-cols-4">
                        <SummaryStat label="Total Orders" value={String(customerSummaryQuery.data.totalOrders)} />
                        <SummaryStat label="Draft" value={String(customerSummaryQuery.data.draftOrders)} />
                        <SummaryStat label="Confirmed" value={String(customerSummaryQuery.data.confirmedOrders)} />
                        <SummaryStat label="Total Sales" value={`$${customerSummaryQuery.data.totalAmount}`} />
                      </div>
                    ) : customerSummaryQuery.isLoading ? (
                      <div className="mb-5 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
                        Loading order summary...
                      </div>
                    ) : null}
                    {customerSummaryQuery.isError ? (
                      <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        Could not load order summary.
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h4 className="text-base font-semibold">Recent Orders</h4>
                        <p className="text-sm text-neutral-500">Open the customer's latest order records.</p>
                      </div>
                      <Link
                        className="inline-flex items-center justify-center rounded-full border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 shadow-sm hover:bg-green-50"
                        to={`/sales/orders?customer=${selectedCustomer.id}&from=customer`}
                      >
                        View All
                      </Link>
                    </div>

                    <div className="mt-4 divide-y divide-neutral-200 rounded-md border border-neutral-200">
                      {recentOrders.map((order) => (
                        <div key={order.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{order.soNumber}</p>
                                <StatusPill status={order.status} />
                              </div>
                              <p className="mt-1 text-sm text-neutral-500">
                                {new Date(order.orderDate).toLocaleDateString()} · ${order.totalAmount}
                              </p>
                            </div>
                            <Link
                              className="inline-flex shrink-0 items-center justify-center rounded-full border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 shadow-sm hover:bg-green-50"
                              to={`/sales/orders?customer=${selectedCustomer.id}&selected=${order.id}&from=customer`}
                            >
                              Open Order
                            </Link>
                          </div>
                        </div>
                      ))}
                      {!recentOrders.length ? (
                        <div className="px-4 py-5 text-sm text-neutral-500">No sales orders exist for this customer yet.</div>
                      ) : null}
                    </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500">
                Select a customer to inspect and edit the record used by Sales Orders.
              </div>
            )}
          </div>
        </div>
      </div>
      ) : null}
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: SalesOrderSummary["status"] }) {
  const tone =
    status === "CONFIRMED"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : status === "SHIPPED"
        ? "bg-green-50 text-green-700 border-green-200"
        : status === "CANCELLED"
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-amber-50 text-amber-700 border-amber-200";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
      {status}
    </span>
  );
}

function InputField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="w-full rounded-md border border-neutral-300 px-3 py-2"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
