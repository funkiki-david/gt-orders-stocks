'use client';

import { useMemo, useState } from 'react';
import customersSeed from '@/data/customers-seed.json';
import ordersSeed from '@/data/orders-seed.json';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { Drawer } from '@/components/Drawer';
import { FormField } from '@/components/FormField';
import { MetricCard } from '@/components/MetricCard';
import { PageHeader } from '@/components/PageHeader';
import { SearchBar } from '@/components/SearchBar';
import { formatCurrency } from '@/lib/format';
import type { Customer, SalesOrder, SalesOrderLineItem } from '@/lib/types';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>(customersSeed as Customer[]);
  const [query, setQuery] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>((customersSeed as Customer[])[0]?.name ?? '');
  const [selectedInvoice, setSelectedInvoice] = useState<string>('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [draft, setDraft] = useState<Customer | null>(null);

  const orders = ordersSeed as SalesOrder[];

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return customers;
    }

    return customers.filter((customer) =>
      [customer.name, customer.payment, customer.salesRep].join(' ').toLowerCase().includes(normalizedQuery),
    );
  }, [customers, query]);

  const selectedCustomer =
    filteredCustomers.find((customer) => customer.name === selectedCustomerName) ?? filteredCustomers[0];

  const selectedCustomerOrders = useMemo(() => {
    if (!selectedCustomer) {
      return [];
    }

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

  function openEditDrawer(customer: Customer) {
    setEditingCustomer(customer);
    setDraft({ ...customer });
  }

  function openAddDrawer() {
    const blankCustomer: Customer = {
      name: '',
      orders: 0,
      total: 0,
      payment: '',
      salesRep: '',
      lastOrder: '',
    };
    setEditingCustomer(null);
    setDraft(blankCustomer);
  }

  function saveDraft() {
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

  return (
    <AppShell>
      <PageHeader
        title="Customer"
        instruction="Select a customer to review their profile, orders, and order detail history."
      />

      <div className="mb-4 rounded-xl border border-border bg-card p-3 text-xs text-secondaryText">
        QuickBooks-style customer workflow: Customer List → Customer Detail → Customer Orders → Selected Order Detail.
        All data is local seed data in this MVP.
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="Customers" value={filteredCustomers.length} />
        <MetricCard label="Total Orders" value={orderTotal} />
        <MetricCard label="Sales Total" value={formatCurrency(salesTotal)} />
        <MetricCard label="Waiting Status" value={waitingCount} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Search Customer / Payment / Sales Rep" />
        <Button variant="primary" onClick={openAddDrawer}>Add Customer</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <DataTable
          rows={filteredCustomers}
          rowKey={(customer) => customer.name}
          activeRowKey={selectedCustomer?.name}
          onRowClick={selectCustomer}
          columns={[
            { key: 'name', header: 'Customer Name', render: (customer) => customer.name },
            { key: 'orders', header: 'Orders', align: 'center', render: (customer) => customer.orders },
            { key: 'total', header: 'Sales Total', align: 'right', render: (customer) => formatCurrency(customer.total) },
          ]}
        />

        <CustomerDetailPanel
          customer={selectedCustomer}
          orders={selectedCustomerOrders}
          selectedOrder={selectedOrder}
          onSelectOrder={(order) => setSelectedInvoice(order.invoice)}
          onEditCustomer={openEditDrawer}
        />
      </div>

      <Drawer
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
        helper="Customer Name is required. Save updates local React state only."
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        onSave={saveDraft}
      >
        {draft ? (
          <div className="grid gap-4">
            <FormField label="Customer Name *" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
            <FormField
              label="Orders"
              type="number"
              value={draft.orders}
              onChange={(value) => setDraft({ ...draft, orders: Number(value) })}
            />
            <FormField
              label="Sales Total"
              type="number"
              value={draft.total}
              onChange={(value) => setDraft({ ...draft, total: Number(value) })}
            />
            <FormField label="Payment Info" value={draft.payment} onChange={(value) => setDraft({ ...draft, payment: value })} />
            <FormField label="Sales Rep" value={draft.salesRep} onChange={(value) => setDraft({ ...draft, salesRep: value })} />
            <FormField label="Last Order" value={draft.lastOrder} onChange={(value) => setDraft({ ...draft, lastOrder: value })} />
            <FormField label="Default Shipping Address" value="" multiline />
            <div className="rounded-xl bg-warningBg p-3 text-xs text-warningText">
              Contact, phone, email, payment term, and address should become formal customer master fields in the database version.
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
}: {
  customer?: Customer;
  orders: SalesOrder[];
  selectedOrder?: SalesOrder;
  onSelectOrder: (order: SalesOrder) => void;
  onEditCustomer: (customer: Customer) => void;
}) {
  if (!customer) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-title text-base font-semibold text-primaryText">Customer Detail</h2>
        <p className="mt-2 text-sm text-secondaryText">No customer selected.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-title text-base font-semibold text-primaryText">{customer.name}</h2>
          <p className="mt-1 text-xs text-helperText">Customer profile, sales order history, and selected order details.</p>
        </div>
        <Button onClick={() => onEditCustomer(customer)}>Edit Customer</Button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="Orders" value={orders.length} />
        <MetricCard label="Sales Total" value={formatCurrency(customer.total)} />
        <MetricCard label="Payment Info" value={customer.payment || '—'} />
        <MetricCard label="Last Order" value={customer.lastOrder || '—'} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ReadOnlyField label="Customer Name" value={customer.name} />
        <ReadOnlyField label="Sales Rep" value={customer.salesRep || '—'} />
        <ReadOnlyField label="Payment Info" value={customer.payment || '—'} />
        <ReadOnlyField label="Default Shipping Address" value="Not set" />
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
            { key: 'qty', header: 'Qty', align: 'center', render: (order) => order.totalQty },
            { key: 'subtotal', header: 'Subtotal', align: 'right', render: (order) => formatCurrency(order.subtotal) },
          ]}
        />
      </div>

      <SelectedCustomerOrderDetail order={selectedOrder} />
    </section>
  );
}

function SelectedCustomerOrderDetail({ order }: { order?: SalesOrder }) {
  if (!order) {
    return (
      <div className="rounded-xl border border-border bg-page p-4 text-sm text-secondaryText">
        Select an order to view line item details.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-page p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-title text-base font-semibold text-primaryText">Selected Order Detail</div>
          <div className="mt-1 text-xs text-helperText">
            {order.invoice} · {order.date} · PO {order.po || '—'}
          </div>
        </div>
        <div className="rounded-full bg-secondaryButton px-3 py-1.5 text-xs text-secondaryText">
          {order.items.length} line items
        </div>
      </div>

      <DataTable
        rows={order.items}
        rowKey={(line: SalesOrderLineItem, index) => `${line.sku}-${index}`}
        columns={[
          { key: 'sku', header: 'SKU', render: (line) => line.sku },
          { key: 'description', header: 'Description', render: (line) => line.description },
          { key: 'width', header: 'W', align: 'center', render: (line) => line.width },
          { key: 'length', header: 'L', align: 'center', render: (line) => line.length },
          { key: 'category', header: 'Category', render: (line) => line.category },
          { key: 'qty', header: 'Qty', align: 'center', render: (line) => line.qty },
          { key: 'unit', header: 'Unit', align: 'right', render: (line) => formatCurrency(line.unitPrice) },
          { key: 'total', header: 'Total', align: 'right', render: (line) => formatCurrency(line.total || line.qty * line.unitPrice) },
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
