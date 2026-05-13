'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Drawer } from '@/components/Drawer';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { SearchBar } from '@/components/SearchBar';
import { StatusText } from '@/components/StatusText';
import { formatCurrency } from '@/lib/format';
import type { Customer, SalesOrder, SalesOrderLineItem } from '@/lib/types';

type PaymentDraft = {
  invoice: string;
  payment: string;
};

type CustomerSortKey = 'customer-asc' | 'customer-desc' | 'last-order-desc' | 'last-order-asc' | 'orders-desc' | 'orders-asc';

type CustomerApiLineItem = {
  sku: string;
  description: string;
  width: string;
  length: string;
  category: string;
  qty: number;
  unitPrice: number;
  total: number;
};

type CustomerApiSalesOrder = {
  invoice: string;
  date: string;
  shipDate: string;
  customer: string;
  po: string;
  payment: string;
  shipMethod: string;
  shipCost: string;
  salesRep: string;
  items: CustomerApiLineItem[];
  totalQty: number;
  subtotal: number;
  fulfillmentStatus?: string;
  paymentStatus?: string;
  cancelReason?: string | null;
  statusNotes?: string;
};

type CustomerApiRecord = {
  ui: Customer;
  salesOrders: CustomerApiSalesOrder[];
};

type CustomersResponse =
  | {
      ok: true;
      data: CustomerApiRecord[];
    }
  | {
      ok: false;
      error: string;
    };

function normalizeCustomer(customer: Customer): Customer {
  return {
    ...customer,
    contactPerson: customer.contactPerson ?? '',
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    billingAddress: customer.billingAddress ?? '',
    shippingAddress: customer.shippingAddress ?? '',
    paymentTerm: customer.paymentTerm ?? '',
    notes: customer.notes ?? '',
  };
}

function makeBlankCustomer(): Customer {
  return {
    name: '',
    orders: 0,
    total: 0,
    payment: '',
    salesRep: '',
    lastOrder: '',
    contactPerson: '',
    phone: '',
    email: '',
    billingAddress: '',
    shippingAddress: '',
    paymentTerm: '',
    notes: '',
  };
}

function mapCancelReason(value?: string | null) {
  if (value === 'CUSTOMER_CANCELLED') return 'Customer Cancelled';
  if (value === 'OUT_OF_STOCK') return 'Out of Stock';
  if (value === 'WRONG_ORDER') return 'Wrong Order';
  if (value === 'OTHER') return 'Other';
  return '';
}

function mapSalesOrder(order: CustomerApiSalesOrder): SalesOrder {
  return {
    ...order,
    fulfillmentStatus: order.fulfillmentStatus as SalesOrder['fulfillmentStatus'],
    paymentStatus: order.paymentStatus as SalesOrder['paymentStatus'],
    cancelReason: mapCancelReason(order.cancelReason),
  };
}

function fallbackPaymentStatus(order: SalesOrder) {
  return order.paymentStatus ?? (order.payment?.toLowerCase().includes('paid') ? 'Paid' : 'Unpaid');
}

function sortCustomers(customers: Customer[], sortKey: CustomerSortKey) {
  const sorted = [...customers];

  sorted.sort((a, b) => {
    switch (sortKey) {
      case 'customer-asc':
        return a.name.localeCompare(b.name);
      case 'customer-desc':
        return b.name.localeCompare(a.name);
      case 'last-order-desc':
        return (b.lastOrder || '').localeCompare(a.lastOrder || '');
      case 'last-order-asc':
        return (a.lastOrder || '').localeCompare(b.lastOrder || '');
      case 'orders-desc':
        return Number(b.orders || 0) - Number(a.orders || 0);
      case 'orders-asc':
        return Number(a.orders || 0) - Number(b.orders || 0);
      default:
        return 0;
    }
  });

  return sorted;
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<CustomerSortKey>('customer-asc');
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>('');
  const [selectedInvoice, setSelectedInvoice] = useState<string>('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [draft, setDraft] = useState<Customer | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const [editingLine, setEditingLine] = useState<SalesOrderLineItem | null>(null);
  const [draftLine, setDraftLine] = useState<SalesOrderLineItem | null>(null);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [customersError, setCustomersError] = useState('');

  const loadCustomers = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      if (showLoading) {
        setIsLoadingCustomers(true);
      }
      setCustomersError('');

      try {
        const response = await fetch('/api/customers', {
          cache: 'no-store',
        });
        const result = (await response.json()) as CustomersResponse;

        if (!response.ok || !result.ok) {
          throw new Error(result.ok ? 'Failed to load customers' : result.error);
        }

        const nextCustomers = result.data.map((customer) => normalizeCustomer(customer.ui));
        const nextOrders = result.data.flatMap((customer) => customer.salesOrders.map((order) => mapSalesOrder(order)));

        setCustomers(nextCustomers);
        setOrders(nextOrders);
        setSelectedCustomerName((current) => {
          if (current && nextCustomers.some((customer) => customer.name === current)) {
            return current;
          }

          return nextCustomers[0]?.name ?? '';
        });
        setSelectedInvoice((current) => {
          if (current && nextOrders.some((order) => order.invoice === current)) {
            return current;
          }

          return nextOrders[0]?.invoice ?? '';
        });
      } catch (error) {
        setCustomersError(error instanceof Error ? error.message : 'Failed to load customers');
      } finally {
        if (showLoading) {
          setIsLoadingCustomers(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    const hasOpenDraft = Boolean(draft || paymentDraft || draftLine);

    async function refreshCustomers() {
      if (document.visibilityState !== 'visible' || hasOpenDraft) return;
      await loadCustomers({ showLoading: false });
    }

    function queueRefreshCustomers() {
      refreshCustomers().catch((error) => {
        setCustomersError(error instanceof Error ? error.message : 'Failed to refresh customers');
      });
    }

    const interval = window.setInterval(queueRefreshCustomers, 15000);

    window.addEventListener('focus', queueRefreshCustomers);
    document.addEventListener('visibilitychange', queueRefreshCustomers);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', queueRefreshCustomers);
      document.removeEventListener('visibilitychange', queueRefreshCustomers);
    };
  }, [draft, draftLine, loadCustomers, paymentDraft]);

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchedCustomers = normalizedQuery
      ? customers.filter((customer) =>
          [
            customer.name,
            customer.payment,
            customer.salesRep,
            customer.contactPerson ?? '',
            customer.phone ?? '',
            customer.email ?? '',
            customer.billingAddress ?? '',
            customer.shippingAddress ?? '',
            customer.paymentTerm ?? '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : customers;

    return sortCustomers(matchedCustomers, sortKey);
  }, [customers, query, sortKey]);

  const selectedCustomer =
    filteredCustomers.find((customer) => customer.name === selectedCustomerName) ?? filteredCustomers[0];

  const selectedCustomerOrders = useMemo(() => {
    if (!selectedCustomer) return [];
    return orders.filter((order) => order.customer.toLowerCase() === selectedCustomer.name.toLowerCase());
  }, [orders, selectedCustomer]);

  const selectedOrder =
    selectedCustomerOrders.find((order) => order.invoice === selectedInvoice) ?? selectedCustomerOrders[0];

  const salesTotal = filteredCustomers.reduce((sum, customer) => sum + Number(customer.total || 0), 0);
  const orderTotal = filteredCustomers.reduce((sum, customer) => sum + Number(customer.orders || 0), 0);
  const waitingCount = filteredCustomers.filter((customer) => customer.payment.toLowerCase().includes('waiting')).length;

  function selectCustomer(customer: Customer) {
    setSelectedCustomerName(customer.name);
    const firstOrder = orders.find((order) => order.customer.toLowerCase() === customer.name.toLowerCase());
    setSelectedInvoice(firstOrder?.invoice ?? '');
  }

  function handleSortChange(value: CustomerSortKey) {
    setSortKey(value);
    const sorted = sortCustomers(filteredCustomers, value);
    if (sorted.length > 0) selectCustomer(sorted[0]);
  }

  function openEditCustomerDrawer(customer: Customer) {
    setEditingCustomer(customer);
    setDraft(normalizeCustomer(customer));
  }

  function openAddCustomerDrawer() {
    setEditingCustomer(null);
    setDraft(makeBlankCustomer());
  }

  function saveCustomerDraft() {
    if (!draft) return;

    if (editingCustomer) {
      setCustomers((current) => current.map((customer) => (customer.name === editingCustomer.name ? draft : customer)));
      setSelectedCustomerName(draft.name);
    } else {
      setCustomers((current) => [draft, ...current]);
      setSelectedCustomerName(draft.name);
    }

    setDraft(null);
    setEditingCustomer(null);
  }

  function openPaymentDrawer(order: SalesOrder) {
    setPaymentDraft({ invoice: order.invoice, payment: order.payment });
  }

  function savePaymentDraft() {
    if (!paymentDraft) return;

    setOrders((current) =>
      current.map((order) =>
        order.invoice === paymentDraft.invoice ? { ...order, payment: paymentDraft.payment } : order,
      ),
    );
    setPaymentDraft(null);
  }

  function openLineDrawer(line: SalesOrderLineItem) {
    setEditingLine(line);
    setDraftLine({ ...line });
  }

  function openSalesOrder(order: SalesOrder) {
    setSelectedInvoice(order.invoice);
    router.push(`/sales-orders?salesOrder=${encodeURIComponent(order.invoice)}`);
  }

  function saveLineDraft() {
    if (!draftLine || !editingLine || !selectedOrder) return;

    const updatedLine: SalesOrderLineItem = {
      ...draftLine,
      total: Number(draftLine.qty || 0) * Number(draftLine.unitPrice || 0),
    };

    setOrders((current) =>
      current.map((order) => {
        if (order.invoice !== selectedOrder.invoice) return order;

        const items = order.items.map((line) =>
          line.sku === editingLine.sku && line.description === editingLine.description ? updatedLine : line,
        );
        const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
        const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);

        return { ...order, items, totalQty, subtotal };
      }),
    );

    setEditingLine(null);
    setDraftLine(null);
  }

  return (
    <AppShell>
      <PageHeader
        title="Customer"
        instruction="Step 1: select a customer from the left. Step 2: review profile, orders, and order detail on the right."
      />

      <div className="mb-3 rounded-xl border border-border bg-card p-2.5 text-xs text-secondaryText">
        Customer records load from PostgreSQL. Orders, sales total, and last order are calculated from Sales Orders.
      </div>

      {isLoadingCustomers ? (
        <div className="mb-3 rounded-xl border border-border bg-card p-3 text-sm text-secondaryText">
          Loading customers from database...
        </div>
      ) : null}

      {customersError ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {customersError}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
        <div className="flex flex-wrap gap-4 text-[13px] text-primaryText">
          <span><strong>{filteredCustomers.length}</strong> Customers</span>
          <span><strong>{orderTotal}</strong> Orders</span>
          <span><strong>{formatCurrency(salesTotal)}</strong> Total Sales</span>
          <span><strong>{waitingCount}</strong> Waiting</span>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Search Customer / Contact / Phone / Address / Payment Term" />
        <Button variant="primary" onClick={openAddCustomerDrawer}>Add Customer</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[460px_1fr]">
        <section className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 rounded-xl bg-warningBg p-3 text-sm text-warningText">
            <strong>Step 1:</strong> Click a Customer below. The selected row turns bold and the detail opens on the right.
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="font-title text-base font-semibold text-primaryText">Customer List</div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-secondaryText" htmlFor="customer-sort-left">Sort</label>
              <select
                id="customer-sort-left"
                value={sortKey}
                onChange={(event) => handleSortChange(event.target.value as CustomerSortKey)}
                className="h-8 rounded-full border border-border bg-white px-3 text-[13px] text-primaryText"
              >
                <option value="customer-asc">Customer: A-Z</option>
                <option value="customer-desc">Customer: Z-A</option>
                <option value="last-order-desc">Last Order: Newest</option>
                <option value="last-order-asc">Last Order: Oldest</option>
                <option value="orders-desc">Orders: Most</option>
                <option value="orders-asc">Orders: Fewest</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-header">
                <tr>
                  <th className="h-9 w-[52%] border-b border-border px-2 text-left font-semibold text-primaryText">Company</th>
                  <th className="h-9 w-[18%] border-b border-border px-2 text-center font-semibold text-primaryText">Orders</th>
                  <th className="h-9 w-[30%] border-b border-border px-2 text-left font-semibold text-primaryText">Last Order</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => {
                  const isSelected = customer.name === selectedCustomer?.name;

                  return (
                    <tr
                      key={customer.name}
                      onClick={() => selectCustomer(customer)}
                      className={`cursor-pointer hover:bg-page ${isSelected ? 'bg-page font-semibold' : ''}`}
                    >
                      <td className="border-b border-border px-2 py-2 text-primaryText">{customer.name}</td>
                      <td className="border-b border-border px-2 py-2 text-center text-primaryText">{customer.orders}</td>
                      <td className="border-b border-border px-2 py-2 text-primaryText">{customer.lastOrder || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border-2 border-primaryButton/30 bg-white p-3">
          <div className="mb-3 rounded-xl bg-successBg p-3 text-sm text-successText">
            <strong>Step 2:</strong> Review the selected Customer here. Current selection: <strong>{selectedCustomer?.name ?? 'None'}</strong>
          </div>
          <CustomerDetailPanel
            customer={selectedCustomer}
            orders={selectedCustomerOrders}
            selectedOrder={selectedOrder}
            onSelectOrder={(order) => setSelectedInvoice(order.invoice)}
            onOpenOrder={openSalesOrder}
            onEditCustomer={openEditCustomerDrawer}
            onEditPayment={openPaymentDrawer}
            onEditLine={openLineDrawer}
          />
        </section>
      </div>

      <Drawer
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
        helper="Create or update customer master data. Order totals are calculated automatically from Sales Orders."
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        onSave={saveCustomerDraft}
      >
        {draft ? (
          <div className="grid gap-4">
            <FormField label="Company Name *" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
            <FormField label="Contact Person Name" value={draft.contactPerson ?? ''} onChange={(value) => setDraft({ ...draft, contactPerson: value })} />
            <FormField label="Phone" value={draft.phone ?? ''} onChange={(value) => setDraft({ ...draft, phone: value })} />
            <FormField label="Email" value={draft.email ?? ''} onChange={(value) => setDraft({ ...draft, email: value })} />
            <FormField label="Billing Address" value={draft.billingAddress ?? ''} onChange={(value) => setDraft({ ...draft, billingAddress: value })} multiline />
            <FormField label="Default Shipping Address" value={draft.shippingAddress ?? ''} onChange={(value) => setDraft({ ...draft, shippingAddress: value })} multiline />
            <FormField label="Payment Term" value={draft.paymentTerm ?? ''} onChange={(value) => setDraft({ ...draft, paymentTerm: value })} />
            <FormField label="Notes" value={draft.notes ?? ''} onChange={(value) => setDraft({ ...draft, notes: value })} multiline />
            <div className="rounded-xl bg-warningBg p-3 text-xs text-warningText">
              Orders, Sales Total, and Last Order are system-calculated fields. They are not entered when adding a customer.
            </div>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        title="Edit Payment"
        helper="This quick edit updates the selected order payment info in local state only."
        open={Boolean(paymentDraft)}
        onClose={() => setPaymentDraft(null)}
        onSave={savePaymentDraft}
      >
        {paymentDraft ? (
          <div className="grid gap-4">
            <FormField label="Sales Order #" value={paymentDraft.invoice} />
            <FormField label="Payment Info" value={paymentDraft.payment} onChange={(value) => setPaymentDraft({ ...paymentDraft, payment: value })} />
            <div className="rounded-xl bg-warningBg p-3 text-xs text-warningText">
              Suggested values: Waiting, Paid, SQ Invoice, Consignment, or custom text.
            </div>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        title="Edit Line Item"
        helper="Line item changes update this order only. They do not update Inventory master data."
        open={Boolean(draftLine)}
        onClose={() => {
          setEditingLine(null);
          setDraftLine(null);
        }}
        onSave={saveLineDraft}
      >
        {draftLine ? (
          <div className="grid gap-4">
            <FormField label="SKU Code" value={draftLine.sku} onChange={(value) => setDraftLine({ ...draftLine, sku: value })} />
            <FormField label="Description" value={draftLine.description} onChange={(value) => setDraftLine({ ...draftLine, description: value })} multiline />
            <FormField label="Width" value={draftLine.width} onChange={(value) => setDraftLine({ ...draftLine, width: value })} />
            <FormField label="Length" value={draftLine.length} onChange={(value) => setDraftLine({ ...draftLine, length: value })} />
            <FormField label="Category" value={draftLine.category} onChange={(value) => setDraftLine({ ...draftLine, category: value })} />
            <FormField label="Qty (CTN)" type="number" value={draftLine.qty} onChange={(value) => setDraftLine({ ...draftLine, qty: Number(value) })} />
            <FormField label="Unit Price" type="number" value={draftLine.unitPrice} onChange={(value) => setDraftLine({ ...draftLine, unitPrice: Number(value) })} />
            <div className="rounded-xl bg-page p-3 text-sm text-primaryText">
              Preview Total: {formatCurrency(Number(draftLine.qty || 0) * Number(draftLine.unitPrice || 0))}
            </div>
          </div>
        ) : null}
      </Drawer>
    </AppShell>
  );
}

function CustomerDetailPanel({
  customer,
  orders,
  selectedOrder,
  onSelectOrder,
  onOpenOrder,
  onEditCustomer,
  onEditPayment,
  onEditLine,
}: {
  customer?: Customer;
  orders: SalesOrder[];
  selectedOrder?: SalesOrder;
  onSelectOrder: (order: SalesOrder) => void;
  onOpenOrder: (order: SalesOrder) => void;
  onEditCustomer: (customer: Customer) => void;
  onEditPayment: (order: SalesOrder) => void;
  onEditLine: (line: SalesOrderLineItem) => void;
}) {
  if (!customer) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-title text-[15px] font-semibold text-primaryText">Customer Detail</h2>
        <p className="mt-1 text-xs text-secondaryText">No customer selected.</p>
      </section>
    );
  }

  const customerSalesTotal = orders.reduce((sum, order) => sum + Number(order.subtotal || 0), 0);
  const paymentStatuses = Array.from(new Set(orders.map((order) => order.payment).filter(Boolean))).join(' / ') || '—';

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-title text-[15px] font-semibold text-primaryText">{customer.name}</h2>
          <p className="mt-0.5 text-xs text-helperText">Customer profile, order history, and quick order actions.</p>
        </div>
        <Button onClick={() => onEditCustomer(customer)}>Edit Customer</Button>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-page px-3 py-1.5 text-xs text-secondaryText">
        <span>Orders: {orders.length}</span>
        <span>Sales: {formatCurrency(customerSalesTotal || customer.total)}</span>
        <span>Status: {paymentStatuses}</span>
        <span>Last: {customer.lastOrder || '—'}</span>
      </div>

      <div className="mb-3 rounded-lg border border-border bg-page p-3">
        <div className="mb-2 font-title text-[15px] font-semibold text-primaryText">Customer Profile</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <ReadOnlyField label="Company Name" value={customer.name} />
          <ReadOnlyField label="Contact Person Name" value={customer.contactPerson || 'Not set'} />
          <ReadOnlyField label="Phone" value={customer.phone || 'Not set'} />
          <ReadOnlyField label="Email" value={customer.email || 'Not set'} />
          <ReadOnlyField label="Payment Term" value={customer.paymentTerm || 'Not set'} />
          <ReadOnlyField label="Sales Rep" value={customer.salesRep || '—'} />
          <ReadOnlyField label="Billing Address" value={customer.billingAddress || 'Not set'} />
          <ReadOnlyField label="Default Shipping Address" value={customer.shippingAddress || 'Not set'} />
        </div>
        {customer.notes ? <div className="mt-2 text-xs text-secondaryText">Notes: {customer.notes}</div> : null}
      </div>

      <div className="mb-2 rounded-lg bg-warningBg px-3 py-2 text-xs text-warningText">
        <strong>Step 2A:</strong> Click one order below. <strong>Step 2B:</strong> Review line items in Selected Order Detail.
      </div>

      <div className="mb-3">
        <div className="mb-1.5 font-title text-[15px] font-semibold text-primaryText">Orders from this Customer</div>
        <CompactOrdersTable
          orders={orders}
          selectedOrder={selectedOrder}
          onSelectOrder={onSelectOrder}
          onOpenOrder={onOpenOrder}
        />
      </div>

      <SelectedCustomerOrderDetail order={selectedOrder} onEditPayment={onEditPayment} onEditLine={onEditLine} />
    </section>
  );
}

function CompactOrdersTable({
  orders,
  selectedOrder,
  onSelectOrder,
  onOpenOrder,
}: {
  orders: SalesOrder[];
  selectedOrder?: SalesOrder;
  onSelectOrder: (order: SalesOrder) => void;
  onOpenOrder: (order: SalesOrder) => void;
}) {
  if (orders.length === 0) {
    return <div className="rounded-lg border border-border bg-card p-3 text-xs text-secondaryText">No orders found for this customer.</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-[13px]">
        <thead className="bg-header">
          <tr>
            <th className="h-8 border-b border-border px-2 text-left font-semibold text-primaryText">Sales Order #</th>
            <th className="h-8 border-b border-border px-2 text-left font-semibold text-primaryText">Date</th>
            <th className="h-8 border-b border-border px-2 text-left font-semibold text-primaryText">PO #</th>
            <th className="h-8 border-b border-border px-2 text-left font-semibold text-primaryText">Fulfillment Status</th>
            <th className="h-8 border-b border-border px-2 text-left font-semibold text-primaryText">Payment Status</th>
            <th className="h-8 border-b border-border px-2 text-right font-semibold text-primaryText">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const isSelected = order.invoice === selectedOrder?.invoice;

            return (
              <tr
                key={order.invoice}
                role="link"
                tabIndex={0}
                title={`Open ${order.invoice} in Sales Order`}
                onMouseEnter={() => onSelectOrder(order)}
                onFocus={() => onSelectOrder(order)}
                onClick={() => onOpenOrder(order)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpenOrder(order);
                  }
                }}
                className={`cursor-pointer transition hover:bg-warningBg ${
                  isSelected ? 'bg-warningBg font-semibold' : ''
                }`}
              >
                <td className="border-b border-border px-2 py-2 text-primaryText">{order.invoice}</td>
                <td className="border-b border-border px-2 py-2 text-primaryText">{order.date}</td>
                <td className="border-b border-border px-2 py-2 text-primaryText">{order.po || '—'}</td>
                <td className="border-b border-border px-2 py-2">
                  <StatusText kind="fulfillment" value={order.fulfillmentStatus ?? 'Open'} />
                </td>
                <td className="border-b border-border px-2 py-2">
                  <StatusText kind="payment" value={fallbackPaymentStatus(order)} />
                </td>
                <td className="border-b border-border px-2 py-2 text-right text-primaryText">{formatCurrency(order.subtotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SelectedCustomerOrderDetail({
  order,
  onEditPayment,
  onEditLine,
}: {
  order?: SalesOrder;
  onEditPayment: (order: SalesOrder) => void;
  onEditLine: (line: SalesOrderLineItem) => void;
}) {
  if (!order) {
    return <div className="rounded-lg border border-border bg-page p-3 text-xs text-secondaryText">Select an order to view line item details.</div>;
  }

  return (
    <div className="rounded-lg border border-border bg-page p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-title text-[15px] font-semibold text-primaryText">Selected Order Detail</div>
          <div className="mt-0.5 text-xs text-helperText">
            {order.invoice} · {order.date} · PO {order.po || '—'} · Payment: {order.payment || '—'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/sales-orders?salesOrder=${encodeURIComponent(order.invoice)}`}>
            <Button>View Full Order</Button>
          </Link>
          <Button onClick={() => onEditPayment(order)}>Edit Payment</Button>
        </div>
      </div>

      <CompactLineItemsTable items={order.items} onEditLine={onEditLine} />
    </div>
  );
}

function CompactLineItemsTable({
  items,
  onEditLine,
}: {
  items: SalesOrderLineItem[];
  onEditLine: (line: SalesOrderLineItem) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-[13px]">
        <thead className="bg-header">
          <tr>
            <th className="h-8 border-b border-border px-2 text-left font-semibold text-primaryText">SKU</th>
            <th className="h-8 border-b border-border px-2 text-left font-semibold text-primaryText">Description</th>
            <th className="h-8 border-b border-border px-2 text-center font-semibold text-primaryText">Qty</th>
            <th className="h-8 border-b border-border px-2 text-right font-semibold text-primaryText">Unit</th>
            <th className="h-8 border-b border-border px-2 text-right font-semibold text-primaryText">Total</th>
            <th className="h-8 border-b border-border px-2 text-center font-semibold text-primaryText">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((line, index) => (
            <tr key={`${line.sku}-${index}`}>
              <td className="border-b border-border px-2 py-2 text-primaryText">{line.sku}</td>
              <td className="border-b border-border px-2 py-2 text-primaryText">{line.description}</td>
              <td className="border-b border-border px-2 py-2 text-center text-primaryText">{line.qty}</td>
              <td className="border-b border-border px-2 py-2 text-right text-primaryText">{formatCurrency(line.unitPrice)}</td>
              <td className="border-b border-border px-2 py-2 text-right text-primaryText">{formatCurrency(line.total || line.qty * line.unitPrice)}</td>
              <td className="border-b border-border px-2 py-2 text-center">
                <Button size="small" onClick={() => onEditLine(line)}>Edit</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-primaryText">{label}</span>
      <input
        value={value}
        readOnly
        className="h-8 w-full rounded-md border border-border bg-white px-2 text-[13px] text-primaryText"
      />
    </label>
  );
}
