'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import customersSeed from '@/data/customers-seed.json';
import ordersSeed from '@/data/orders-seed.json';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { Drawer } from '@/components/Drawer';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { SearchBar } from '@/components/SearchBar';
import { formatCurrency } from '@/lib/format';
import type { Customer, SalesOrder, SalesOrderLineItem } from '@/lib/types';

type PaymentDraft = {
  invoice: string;
  payment: string;
};

type CustomerSortKey = 'customer-asc' | 'customer-desc' | 'last-order-desc' | 'last-order-asc' | 'orders-desc' | 'orders-asc';

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
  const [customers, setCustomers] = useState<Customer[]>(
    (customersSeed as Customer[]).map((customer) => normalizeCustomer(customer)),
  );
  const [orders, setOrders] = useState<SalesOrder[]>(ordersSeed as SalesOrder[]);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<CustomerSortKey>('customer-asc');
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>((customersSeed as Customer[])[0]?.name ?? '');
  const [selectedInvoice, setSelectedInvoice] = useState<string>('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [draft, setDraft] = useState<Customer | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const [editingLine, setEditingLine] = useState<SalesOrderLineItem | null>(null);
  const [draftLine, setDraftLine] = useState<SalesOrderLineItem | null>(null);

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
        Customer profile fields are master data. Orders, sales total, and last order are calculated from Sales Orders.
      </div>

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
            <FormField label="Invoice #" value={paymentDraft.invoice} />
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
  onEditCustomer,
  onEditPayment,
  onEditLine,
}: {
  customer?: Customer;
  orders: SalesOrder[];
  selectedOrder?: SalesOrder;
  onSelectOrder: (order: SalesOrder) => void;
  onEditCustomer: (customer: Customer) => void;
  onEditPayment: (order: SalesOrder) => void;
  onEditLine: (line: SalesOrderLineItem) => void;
}) {
  if (!customer) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-title text-base font-semibold text-primaryText">Customer Detail</h2>
        <p className="mt-2 text-sm text-secondaryText">No customer selected.</p>
      </section>
    );
  }

  const customerSalesTotal = orders.reduce((sum, order) => sum + Number(order.subtotal || 0), 0);
  const paymentStatuses = Array.from(new Set(orders.map((order) => order.payment).filter(Boolean))).join(' / ') || '—';

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-title text-base font-semibold text-primaryText">{customer.name}</h2>
          <p className="mt-1 text-xs text-helperText">Customer profile, order history, and quick order actions.</p>
        </div>
        <Button onClick={() => onEditCustomer(customer)}>Edit Customer</Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-border bg-page px-3 py-2 text-xs text-secondaryText">
        <span>Orders: {orders.length}</span>
        <span>Sales Total: {formatCurrency(customerSalesTotal || customer.total)}</span>
        <span>Payment Status: {paymentStatuses}</span>
        <span>Last Order: {customer.lastOrder || '—'}</span>
      </div>

      <div className="mb-4 rounded-xl border border-border bg-page p-4">
        <div className="mb-3 font-title text-base font-semibold text-primaryText">Customer Profile</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ReadOnlyField label="Company Name" value={customer.name} />
          <ReadOnlyField label="Contact Person Name" value={customer.contactPerson || 'Not set'} />
          <ReadOnlyField label="Phone" value={customer.phone || 'Not set'} />
          <ReadOnlyField label="Email" value={customer.email || 'Not set'} />
          <ReadOnlyField label="Payment Term" value={customer.paymentTerm || 'Not set'} />
          <ReadOnlyField label="Sales Rep" value={customer.salesRep || '—'} />
          <ReadOnlyField label="Billing Address" value={customer.billingAddress || 'Not set'} />
          <ReadOnlyField label="Default Shipping Address" value={customer.shippingAddress || 'Not set'} />
        </div>
        {customer.notes ? <div className="mt-3 text-sm text-secondaryText">Notes: {customer.notes}</div> : null}
      </div>

      <div className="mb-3 rounded-xl bg-warningBg p-3 text-sm text-warningText">
        <strong>Step 2A:</strong> Click one order below. <strong>Step 2B:</strong> Review its line items in Selected Order Detail.
      </div>

      <div className="mb-4">
        <div className="mb-2 font-title text-base font-semibold text-primaryText">Orders from this Customer</div>
        <DataTable
          rows={orders}
          rowKey={(order) => order.invoice}
          activeRowKey={selectedOrder?.invoice}
          onRowClick={onSelectOrder}
          emptyMessage="No orders found for this customer."
          columns={[
            { key: 'invoice', header: 'Invoice #', render: (order) => order.invoice },
            { key: 'date', header: 'Date', render: (order) => order.date },
            { key: 'po', header: 'PO #', render: (order) => order.po || '—' },
            { key: 'payment', header: 'Status', render: (order) => order.payment || '—' },
            { key: 'subtotal', header: 'Subtotal', align: 'right', render: (order) => formatCurrency(order.subtotal) },
          ]}
        />
      </div>

      <SelectedCustomerOrderDetail order={selectedOrder} onEditPayment={onEditPayment} onEditLine={onEditLine} />
    </section>
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
    return <div className="rounded-xl border border-border bg-page p-4 text-sm text-secondaryText">Select an order to view line item details.</div>;
  }

  return (
    <div className="rounded-xl border border-border bg-page p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-title text-base font-semibold text-primaryText">Selected Order Detail</div>
          <div className="mt-1 text-xs text-helperText">
            {order.invoice} · {order.date} · PO {order.po || '—'} · Payment: {order.payment || '—'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/sales-orders?invoice=${encodeURIComponent(order.invoice)}`}>
            <Button>View Full Order</Button>
          </Link>
          <Button onClick={() => onEditPayment(order)}>Edit Payment</Button>
        </div>
      </div>

      <DataTable
        rows={order.items}
        rowKey={(line: SalesOrderLineItem, index) => `${line.sku}-${index}`}
        columns={[
          { key: 'sku', header: 'SKU', render: (line) => line.sku },
          { key: 'description', header: 'Description', render: (line) => line.description },
          { key: 'qty', header: 'Qty', align: 'center', render: (line) => line.qty },
          { key: 'unit', header: 'Unit', align: 'right', render: (line) => formatCurrency(line.unitPrice) },
          { key: 'total', header: 'Total', align: 'right', render: (line) => formatCurrency(line.total || line.qty * line.unitPrice) },
          { key: 'action', header: 'Action', align: 'center', render: (line) => <Button size="small" onClick={() => onEditLine(line)}>Edit</Button> },
        ]}
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-primaryText">{label}</span>
      <input
        value={value}
        readOnly
        className="h-[34px] w-full rounded-md border border-border bg-white px-3 text-sm text-primaryText"
      />
    </label>
  );
}
