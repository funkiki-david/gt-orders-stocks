'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ordersSeed from '@/data/orders-seed.json';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Drawer } from '@/components/Drawer';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { SalesOrderDetail } from '@/components/SalesOrderDetail';
import { SearchBar } from '@/components/SearchBar';
import { formatCurrency } from '@/lib/format';
import type {
  CancelReason,
  FulfillmentStatus,
  PaymentStatus,
  SalesOrder,
  SalesOrderLineItem,
} from '@/lib/types';

type SortKey = 'date-desc' | 'date-asc' | 'sales-order-asc' | 'sales-order-desc' | 'customer-asc' | 'customer-desc';

type StatusDraft = {
  invoice: string;
  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: PaymentStatus;
  cancelReason: CancelReason;
  statusNotes: string;
};

function normalizeOrder(order: SalesOrder): SalesOrder {
  return {
    ...order,
    fulfillmentStatus: order.fulfillmentStatus ?? 'Open',
    paymentStatus: order.paymentStatus ?? (order.payment?.toLowerCase().includes('paid') ? 'Paid' : 'Unpaid'),
    cancelReason: order.cancelReason ?? '',
    statusNotes: order.statusNotes ?? '',
  };
}

function sortOrders(orders: SalesOrder[], sortKey: SortKey) {
  const sorted = [...orders];

  sorted.sort((a, b) => {
    switch (sortKey) {
      case 'date-asc':
        return a.date.localeCompare(b.date);
      case 'date-desc':
        return b.date.localeCompare(a.date);
      case 'sales-order-asc':
        return a.invoice.localeCompare(b.invoice);
      case 'sales-order-desc':
        return b.invoice.localeCompare(a.invoice);
      case 'customer-asc':
        return a.customer.localeCompare(b.customer);
      case 'customer-desc':
        return b.customer.localeCompare(a.customer);
      default:
        return 0;
    }
  });

  return sorted;
}

export default function SalesOrdersPage() {
  return (
    <Suspense fallback={<SalesOrdersLoading />}>
      <SalesOrdersContent />
    </Suspense>
  );
}

function SalesOrdersLoading() {
  return (
    <AppShell>
      <PageHeader title="Sales Order" instruction="Loading Sales Orders..." />
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-secondaryText">Loading...</div>
    </AppShell>
  );
}

function SalesOrdersContent() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<SalesOrder[]>((ordersSeed as SalesOrder[]).map((order) => normalizeOrder(order)));
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date-desc');
  const [selectedInvoice, setSelectedInvoice] = useState<string>((ordersSeed as SalesOrder[])[0]?.invoice ?? '');
  const [editingLine, setEditingLine] = useState<SalesOrderLineItem | null>(null);
  const [draftLine, setDraftLine] = useState<SalesOrderLineItem | null>(null);
  const [statusDraft, setStatusDraft] = useState<StatusDraft | null>(null);

  useEffect(() => {
    const requestedSalesOrder = searchParams.get('salesOrder') ?? searchParams.get('invoice');

    if (!requestedSalesOrder) return;

    const matchedOrder = orders.find((order) => order.invoice === requestedSalesOrder);

    if (matchedOrder) {
      setSelectedInvoice(matchedOrder.invoice);
      setQuery(matchedOrder.invoice);
    }
  }, [orders, searchParams]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchedOrders = normalizedQuery
      ? orders.filter((order) =>
          [
            order.invoice,
            order.customer,
            order.po,
            order.payment,
            order.fulfillmentStatus ?? '',
            order.paymentStatus ?? '',
            order.cancelReason ?? '',
            order.items.map((item) => `${item.sku} ${item.description}`).join(' '),
          ]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : orders;

    return sortOrders(matchedOrders, sortKey);
  }, [orders, query, sortKey]);

  const selectedOrder = filteredOrders.find((order) => order.invoice === selectedInvoice) ?? filteredOrders[0];
  const salesTotal = filteredOrders.reduce((sum, order) => sum + Number(order.subtotal || 0), 0);
  const customerCount = new Set(filteredOrders.map((order) => order.customer)).size;

  function openLineDrawer(line: SalesOrderLineItem) {
    setEditingLine(line);
    setDraftLine({ ...line });
  }

  function saveLineDraft() {
    if (!draftLine || !editingLine || !selectedOrder) return;

    const updatedLine = {
      ...draftLine,
      total: Number(draftLine.qty || 0) * Number(draftLine.unitPrice || 0),
    };

    setOrders((current) =>
      current.map((order) => {
        if (order.invoice !== selectedOrder.invoice) {
          return order;
        }

        const items = order.items.map((line) =>
          line.sku === editingLine.sku && line.description === editingLine.description ? updatedLine : line,
        );
        const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
        const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);

        return {
          ...order,
          items,
          totalQty,
          subtotal,
        };
      }),
    );

    setEditingLine(null);
    setDraftLine(null);
  }

  function openStatusDrawer(order: SalesOrder) {
    const normalized = normalizeOrder(order);

    setStatusDraft({
      invoice: normalized.invoice,
      fulfillmentStatus: normalized.fulfillmentStatus ?? 'Open',
      paymentStatus: normalized.paymentStatus ?? 'Unpaid',
      cancelReason: normalized.cancelReason ?? '',
      statusNotes: normalized.statusNotes ?? '',
    });
  }

  function saveStatusDraft() {
    if (!statusDraft) return;

    setOrders((current) =>
      current.map((order) => {
        if (order.invoice !== statusDraft.invoice) return order;

        const isCancelled = statusDraft.fulfillmentStatus === 'Cancelled';

        return {
          ...order,
          fulfillmentStatus: statusDraft.fulfillmentStatus,
          paymentStatus: statusDraft.paymentStatus,
          cancelReason: isCancelled ? statusDraft.cancelReason : '',
          statusNotes: statusDraft.statusNotes,
          payment: statusDraft.paymentStatus,
        };
      }),
    );

    setStatusDraft(null);
  }

  function handleSearch(value: string) {
    setQuery(value);
    const normalizedQuery = value.trim().toLowerCase();
    const firstMatch = sortOrders(orders, sortKey).find((order) =>
      [
        order.invoice,
        order.customer,
        order.po,
        order.payment,
        order.fulfillmentStatus ?? '',
        order.paymentStatus ?? '',
        order.cancelReason ?? '',
        order.items.map((item) => `${item.sku} ${item.description}`).join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );

    if (firstMatch) {
      setSelectedInvoice(firstMatch.invoice);
    }
  }

  function handleSortChange(value: SortKey) {
    setSortKey(value);
    const sorted = sortOrders(filteredOrders, value);

    if (sorted.length > 0) {
      setSelectedInvoice(sorted[0].invoice);
    }
  }

  return (
    <AppShell>
      <PageHeader title="Sales Order" instruction="Step 1: select a Sales Order from the left. Step 2: review or edit details on the right." />

      <div className="mb-3 rounded-xl border border-border bg-card p-2.5 text-xs text-secondaryText">
        Sales Orders use local seed data only. Status and line edits update React state and do not deduct inventory.
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
        <div className="flex flex-wrap gap-4 text-[13px] text-primaryText">
          <span><strong>{filteredOrders.length}</strong> Sales Orders</span>
          <span><strong>{customerCount}</strong> Customers</span>
          <span><strong>{formatCurrency(salesTotal)}</strong> Total Amount</span>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SearchBar value={query} onChange={handleSearch} placeholder="Search Sales Order / Customer / PO / Status / SKU" />
        <Button variant="primary" onClick={() => undefined}>Create Sales Order</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[460px_1fr]">
        <section className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 rounded-xl bg-warningBg p-3 text-sm text-warningText">
            <strong>Step 1:</strong> Click a Sales Order below. The selected row turns bold and the detail opens on the right.
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="font-title text-base font-semibold text-primaryText">Sales Order List</div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-secondaryText" htmlFor="order-sort-left">Sort</label>
              <select
                id="order-sort-left"
                value={sortKey}
                onChange={(event) => handleSortChange(event.target.value as SortKey)}
                className="h-8 rounded-full border border-border bg-white px-3 text-[13px] text-primaryText"
              >
                <option value="date-desc">Date: Newest</option>
                <option value="date-asc">Date: Oldest</option>
                <option value="sales-order-asc">Sales Order #: A-Z</option>
                <option value="sales-order-desc">Sales Order #: Z-A</option>
                <option value="customer-asc">Customer: A-Z</option>
                <option value="customer-desc">Customer: Z-A</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-header">
                <tr>
                  <th className="h-9 w-[42%] border-b border-border px-2 text-left font-semibold text-primaryText">Sales Order #</th>
                  <th className="h-9 w-[24%] border-b border-border px-2 text-left font-semibold text-primaryText">Date</th>
                  <th className="h-9 w-[34%] border-b border-border px-2 text-left font-semibold text-primaryText">Customer</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const isSelected = order.invoice === selectedOrder?.invoice;

                  return (
                    <tr
                      key={order.invoice}
                      onClick={() => setSelectedInvoice(order.invoice)}
                      className={`cursor-pointer hover:bg-page ${isSelected ? 'bg-page font-semibold' : ''}`}
                    >
                      <td className="border-b border-border px-2 py-2 text-primaryText">{order.invoice}</td>
                      <td className="border-b border-border px-2 py-2 text-primaryText">{order.date}</td>
                      <td className="border-b border-border px-2 py-2 text-primaryText">{order.customer}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border-2 border-primaryButton/30 bg-white p-3">
          <div className="mb-3 rounded-xl bg-successBg p-3 text-sm text-successText">
            <strong>Step 2:</strong> Review the selected Sales Order here. Current selection: <strong>{selectedOrder?.invoice ?? 'None'}</strong>
          </div>
          <SalesOrderDetail order={selectedOrder} onEditLine={openLineDrawer} onUpdateStatus={openStatusDrawer} />
        </section>
      </div>

      <Drawer
        title="Update Sales Order Status"
        helper="Use the simplest v1 status model. Cancel Reason appears only when Fulfillment is Cancelled."
        open={Boolean(statusDraft)}
        onClose={() => setStatusDraft(null)}
        onSave={saveStatusDraft}
      >
        {statusDraft ? (
          <div className="grid gap-4">
            <FormField label="Sales Order #" value={statusDraft.invoice} />

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-primaryText">Fulfillment Status</span>
              <select
                value={statusDraft.fulfillmentStatus}
                onChange={(event) =>
                  setStatusDraft({
                    ...statusDraft,
                    fulfillmentStatus: event.target.value as FulfillmentStatus,
                    cancelReason: event.target.value === 'Cancelled' ? statusDraft.cancelReason : '',
                  })
                }
                className="h-[34px] w-full rounded-md border border-border bg-white px-3 text-sm text-primaryText"
              >
                <option value="Open">Open</option>
                <option value="Shipped">Shipped</option>
                <option value="Billed Closed">Billed Closed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-primaryText">Payment Status</span>
              <select
                value={statusDraft.paymentStatus}
                onChange={(event) => setStatusDraft({ ...statusDraft, paymentStatus: event.target.value as PaymentStatus })}
                className="h-[34px] w-full rounded-md border border-border bg-white px-3 text-sm text-primaryText"
              >
                <option value="Unpaid">Unpaid</option>
                <option value="Paid">Paid</option>
                <option value="No Charge">No Charge</option>
              </select>
            </label>

            {statusDraft.fulfillmentStatus === 'Cancelled' ? (
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-primaryText">Cancel Reason</span>
                <select
                  value={statusDraft.cancelReason}
                  onChange={(event) => setStatusDraft({ ...statusDraft, cancelReason: event.target.value as CancelReason })}
                  className="h-[34px] w-full rounded-md border border-border bg-white px-3 text-sm text-primaryText"
                >
                  <option value="">Select reason</option>
                  <option value="Customer Cancelled">Customer Cancelled</option>
                  <option value="Out of Stock">Out of Stock</option>
                  <option value="Wrong Order">Wrong Order</option>
                  <option value="Other">Other</option>
                </select>
              </label>
            ) : null}

            <FormField
              label="Status Notes"
              value={statusDraft.statusNotes}
              onChange={(value) => setStatusDraft({ ...statusDraft, statusNotes: value })}
              multiline
            />

            <div className="rounded-xl bg-warningBg p-3 text-xs text-warningText">
              Sample requests and quality issue no-charge orders can use Fulfillment: Billed Closed and Payment: No Charge, with details in Status Notes.
            </div>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        title="Edit Line Item"
        helper="Line item changes update this Sales Order only. They do not update Inventory master data."
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
            <FormField
              label="Description"
              value={draftLine.description}
              onChange={(value) => setDraftLine({ ...draftLine, description: value })}
              multiline
            />
            <FormField label="Width" value={draftLine.width} onChange={(value) => setDraftLine({ ...draftLine, width: value })} />
            <FormField label="Length" value={draftLine.length} onChange={(value) => setDraftLine({ ...draftLine, length: value })} />
            <FormField label="Category" value={draftLine.category} onChange={(value) => setDraftLine({ ...draftLine, category: value })} />
            <FormField
              label="Qty (CTN)"
              type="number"
              value={draftLine.qty}
              onChange={(value) => setDraftLine({ ...draftLine, qty: Number(value) })}
            />
            <FormField
              label="Unit Price"
              type="number"
              value={draftLine.unitPrice}
              onChange={(value) => setDraftLine({ ...draftLine, unitPrice: Number(value) })}
            />
            <div className="rounded-xl bg-page p-3 text-sm text-primaryText">
              Preview Total: {formatCurrency(Number(draftLine.qty || 0) * Number(draftLine.unitPrice || 0))}
            </div>
            <div className="rounded-xl bg-warningBg p-3 text-xs text-warningText">
              Do not deduct inventory in v1. Inventory deduction should be designed after shipment workflow is defined.
            </div>
          </div>
        ) : null}
      </Drawer>
    </AppShell>
  );
}
