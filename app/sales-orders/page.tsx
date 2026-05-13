'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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

type LineDrawerMode = 'add' | 'edit';

type CreateOrderLineDraft = {
  sku: string;
  description: string;
  width: string;
  length: string;
  category: string;
  qty: number;
  unitPrice: number;
};

type CreateOrderDraft = {
  invoice: string;
  date: string;
  shipDate: string;
  customer: string;
  po: string;
  payment: string;
  shipMethod: string;
  salesRep: string;
  items: CreateOrderLineDraft[];
};

type SalesOrdersResponse =
  | {
      ok: true;
      data: Array<{
        ui: SalesOrder;
      }>;
    }
  | {
      ok: false;
      error: string;
    };

type MutationResponse =
  | {
      ok: true;
      data: unknown;
    }
  | {
      ok: false;
      error: string;
    };

function fulfillmentStatusValue(value: FulfillmentStatus) {
  if (value === 'Shipped') return 'SHIPPED';
  if (value === 'Billed Closed') return 'BILLED_CLOSED';
  if (value === 'Cancelled') return 'CANCELLED';
  return 'OPEN';
}

function paymentStatusValue(value: PaymentStatus) {
  if (value === 'Paid') return 'PAID';
  if (value === 'No Charge') return 'NO_CHARGE';
  return 'UNPAID';
}

function cancelReasonValue(value: CancelReason) {
  if (value === 'Customer Cancelled') return 'CUSTOMER_CANCELLED';
  if (value === 'Out of Stock') return 'OUT_OF_STOCK';
  if (value === 'Wrong Order') return 'WRONG_ORDER';
  if (value === 'Other') return 'OTHER';
  return null;
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function createBlankLine(): CreateOrderLineDraft {
  return {
    sku: '',
    description: '',
    width: '',
    length: '',
    category: '',
    qty: 1,
    unitPrice: 0,
  };
}

function createBlankSalesOrderLine(): SalesOrderLineItem {
  return {
    sku: '',
    description: '',
    width: '',
    length: '',
    category: '',
    qty: 1,
    unitPrice: 0,
    total: 0,
  };
}

function isGeneratedSalesOrderNumber(value: string) {
  return /^GT-\d{4}-\d{2}-\d{2}-\d+$/.test(value);
}

function nextSalesOrderNumber(orders: SalesOrder[], date: string) {
  const orderDate = date || todayValue();
  const prefix = `GT-${orderDate}-`;
  const nextSequence =
    orders.reduce((maxSequence, order) => {
      if (!order.invoice.startsWith(prefix)) return maxSequence;

      const sequence = Number(order.invoice.slice(prefix.length));

      return Number.isInteger(sequence) && sequence > maxSequence ? sequence : maxSequence;
    }, 0) + 1;

  return `${prefix}${nextSequence}`;
}

function createBlankOrder(orders: SalesOrder[]): CreateOrderDraft {
  const today = todayValue();

  return {
    invoice: nextSalesOrderNumber(orders, today),
    date: today,
    shipDate: '',
    customer: '',
    po: '',
    payment: '',
    shipMethod: '',
    salesRep: '',
    items: [createBlankLine()],
  };
}

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
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date-desc');
  const [selectedInvoice, setSelectedInvoice] = useState<string>('');
  const [editingLine, setEditingLine] = useState<SalesOrderLineItem | null>(null);
  const [draftLine, setDraftLine] = useState<SalesOrderLineItem | null>(null);
  const [lineDrawerMode, setLineDrawerMode] = useState<LineDrawerMode>('edit');
  const [lineOrder, setLineOrder] = useState<SalesOrder | null>(null);
  const [statusDraft, setStatusDraft] = useState<StatusDraft | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState('');
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [isSavingLine, setIsSavingLine] = useState(false);
  const [lineError, setLineError] = useState('');
  const [createDraft, setCreateDraft] = useState<CreateOrderDraft | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [createError, setCreateError] = useState('');

  const loadSalesOrders = useCallback(async (preferredInvoice?: string, { showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) {
      setIsLoadingOrders(true);
    }
    setOrdersError('');

    try {
      const response = await fetch('/api/sales-orders', {
        cache: 'no-store',
      });
      const result = (await response.json()) as SalesOrdersResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.ok ? 'Failed to load sales orders' : result.error);
      }

      const nextOrders = result.data.map((order) => normalizeOrder(order.ui));

      setOrders(nextOrders);
      setSelectedInvoice((current) => {
        const nextSelection = preferredInvoice ?? current;
        if (nextSelection && nextOrders.some((order) => order.invoice === nextSelection)) {
          return nextSelection;
        }

        return nextOrders[0]?.invoice ?? '';
      });
    } finally {
      if (showLoading) {
        setIsLoadingOrders(false);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialSalesOrders() {
      try {
        await loadSalesOrders();
      } catch (error) {
        if (!isMounted) return;
        setOrdersError(error instanceof Error ? error.message : 'Failed to load sales orders');
      }
    }

    loadInitialSalesOrders();

    return () => {
      isMounted = false;
    };
  }, [loadSalesOrders]);

  useEffect(() => {
    const hasOpenDraft = Boolean(statusDraft || draftLine || createDraft);

    async function refreshSalesOrders() {
      if (document.visibilityState !== 'visible' || hasOpenDraft) return;
      await loadSalesOrders(selectedInvoice, { showLoading: false });
    }

    function queueRefreshSalesOrders() {
      refreshSalesOrders().catch((error) => {
        setOrdersError(error instanceof Error ? error.message : 'Failed to refresh sales orders');
      });
    }

    const interval = window.setInterval(queueRefreshSalesOrders, 15000);

    window.addEventListener('focus', queueRefreshSalesOrders);
    document.addEventListener('visibilitychange', queueRefreshSalesOrders);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', queueRefreshSalesOrders);
      document.removeEventListener('visibilitychange', queueRefreshSalesOrders);
    };
  }, [createDraft, draftLine, loadSalesOrders, selectedInvoice, statusDraft]);

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
    setLineDrawerMode('edit');
    setEditingLine(line);
    setDraftLine({ ...line });
    setLineOrder(selectedOrder ?? null);
    setLineError('');
  }

  function openAddLineDrawer(order: SalesOrder) {
    setLineDrawerMode('add');
    setEditingLine(null);
    setDraftLine(createBlankSalesOrderLine());
    setLineOrder(order);
    setLineError('');
  }

  async function saveLineDraft() {
    if (!draftLine || !lineOrder) return;
    if (lineDrawerMode === 'add' && !lineOrder.id) {
      setLineError('Could not add line item because the order database id is missing.');
      return;
    }
    if (lineDrawerMode === 'edit' && !editingLine?.id) {
      setLineError('Could not save line item because its database id is missing.');
      return;
    }

    setIsSavingLine(true);
    setLineError('');

    try {
      const response = await fetch(
        lineDrawerMode === 'add' ? '/api/sales-order-items' : `/api/sales-order-items/${editingLine?.id}`,
        {
          method: lineDrawerMode === 'add' ? 'POST' : 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            salesOrderId: lineDrawerMode === 'add' ? lineOrder.id : undefined,
            skuCode: draftLine.sku,
            productDescription: draftLine.description,
            width: draftLine.width,
            length: draftLine.length,
            category: draftLine.category,
            qtyCtn: draftLine.qty,
            unitPrice: draftLine.unitPrice,
            total: Number(draftLine.qty || 0) * Number(draftLine.unitPrice || 0),
          }),
        },
      );
      const result = (await response.json()) as MutationResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.ok ? 'Could not save line item' : result.error);
      }

      await loadSalesOrders(lineOrder.invoice);
      setEditingLine(null);
      setDraftLine(null);
      setLineOrder(null);
    } catch (error) {
      setLineError(error instanceof Error ? error.message : 'Could not save line item');
    } finally {
      setIsSavingLine(false);
    }
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
    setStatusError('');
  }

  async function saveStatusDraft() {
    if (!statusDraft) return;
    const targetOrder = orders.find((order) => order.invoice === statusDraft.invoice);
    if (!targetOrder?.id) {
      setStatusError('Could not save status because the order database id is missing.');
      return;
    }

    setIsSavingStatus(true);
    setStatusError('');

    try {
      const isCancelled = statusDraft.fulfillmentStatus === 'Cancelled';
      const response = await fetch(`/api/sales-orders/${targetOrder.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fulfillmentStatus: fulfillmentStatusValue(statusDraft.fulfillmentStatus),
          paymentStatus: paymentStatusValue(statusDraft.paymentStatus),
          cancelReason: isCancelled ? cancelReasonValue(statusDraft.cancelReason) : null,
          statusNotes: statusDraft.statusNotes,
        }),
      });
      const result = (await response.json()) as MutationResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.ok ? 'Could not save status' : result.error);
      }

      await loadSalesOrders(statusDraft.invoice);
      setStatusDraft(null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Could not save status');
    } finally {
      setIsSavingStatus(false);
    }
  }

  function openCreateDrawer() {
    setCreateDraft(createBlankOrder(orders));
    setCreateError('');
  }

  function updateCreateOrderDate(value: string) {
    if (!createDraft) return;

    setCreateDraft({
      ...createDraft,
      date: value,
      invoice:
        !createDraft.invoice || isGeneratedSalesOrderNumber(createDraft.invoice)
          ? nextSalesOrderNumber(orders, value)
          : createDraft.invoice,
    });
  }

  function updateCreateLine(index: number, patch: Partial<CreateOrderLineDraft>) {
    if (!createDraft) return;

    setCreateDraft({
      ...createDraft,
      items: createDraft.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    });
  }

  function addCreateLine() {
    if (!createDraft) return;

    setCreateDraft({
      ...createDraft,
      items: [...createDraft.items, createBlankLine()],
    });
  }

  function removeCreateLine(index: number) {
    if (!createDraft || createDraft.items.length === 1) return;

    setCreateDraft({
      ...createDraft,
      items: createDraft.items.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  async function saveCreateDraft() {
    if (!createDraft) return;

    setIsCreatingOrder(true);
    setCreateError('');

    try {
      const response = await fetch('/api/sales-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          salesOrderNumber: createDraft.invoice,
          orderDate: createDraft.date,
          shipDate: createDraft.shipDate,
          customerSnapshot: createDraft.customer,
          poNumber: createDraft.po,
          paymentInfo: createDraft.payment,
          shipMethod: createDraft.shipMethod,
          salesRep: createDraft.salesRep,
          items: createDraft.items.map((item) => ({
            skuCode: item.sku,
            productDescription: item.description,
            width: item.width,
            length: item.length,
            category: item.category,
            qtyCtn: item.qty,
            unitPrice: item.unitPrice,
            total: Number(item.qty || 0) * Number(item.unitPrice || 0),
          })),
        }),
      });
      const result = (await response.json()) as MutationResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.ok ? 'Could not create sales order' : result.error);
      }

      await loadSalesOrders(createDraft.invoice);
      setQuery(createDraft.invoice);
      setCreateDraft(null);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create sales order');
    } finally {
      setIsCreatingOrder(false);
    }
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
        Sales Orders and line items load from PostgreSQL. Status and line edits save to the database.
      </div>

      {isLoadingOrders ? (
        <div className="mb-3 rounded-xl border border-border bg-card p-3 text-sm text-secondaryText">
          Loading sales orders from database...
        </div>
      ) : null}

      {ordersError ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {ordersError}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
        <div className="flex flex-wrap gap-4 text-[13px] text-primaryText">
          <span><strong>{filteredOrders.length}</strong> Sales Orders</span>
          <span><strong>{customerCount}</strong> Customers</span>
          <span><strong>{formatCurrency(salesTotal)}</strong> Total Amount</span>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SearchBar value={query} onChange={handleSearch} placeholder="Search Sales Order / Customer / PO / Status / SKU" />
        <Button variant="primary" onClick={openCreateDrawer}>Create Sales Order</Button>
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
          <SalesOrderDetail
            order={selectedOrder}
            onAddLine={openAddLineDrawer}
            onEditLine={openLineDrawer}
            onUpdateStatus={openStatusDrawer}
          />
        </section>
      </div>

      <Drawer
        title="Update Sales Order Status"
        helper="Use the simplest v1 status model. Cancel Reason appears only when Fulfillment is Cancelled."
        open={Boolean(statusDraft)}
        onClose={() => {
          if (isSavingStatus) return;
          setStatusDraft(null);
          setStatusError('');
        }}
        onSave={saveStatusDraft}
      >
        {statusDraft ? (
          <div className="grid gap-4">
            {statusError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {statusError}
              </div>
            ) : null}
            {isSavingStatus ? (
              <div className="rounded-xl border border-border bg-page p-3 text-xs text-secondaryText">
                Saving sales order status to database...
              </div>
            ) : null}
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
        title="Create Sales Order"
        helper="Create the Sales Order and add product lines or customer-facing shipping charges. Inventory is not deducted in this v1 flow."
        open={Boolean(createDraft)}
        onClose={() => {
          if (isCreatingOrder) return;
          setCreateDraft(null);
          setCreateError('');
        }}
        onSave={saveCreateDraft}
      >
        {createDraft ? (
          <div className="grid gap-4">
            {createError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {createError}
              </div>
            ) : null}
            {isCreatingOrder ? (
              <div className="rounded-xl border border-border bg-page p-3 text-xs text-secondaryText">
                Creating sales order in database...
              </div>
            ) : null}

            <FormField label="Sales Order # *" value={createDraft.invoice} onChange={(value) => setCreateDraft({ ...createDraft, invoice: value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Order Date" type="date" value={createDraft.date} onChange={updateCreateOrderDate} />
              <FormField label="Ship Date" type="date" value={createDraft.shipDate} onChange={(value) => setCreateDraft({ ...createDraft, shipDate: value })} />
            </div>
            <FormField label="Customer *" value={createDraft.customer} onChange={(value) => setCreateDraft({ ...createDraft, customer: value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="PO #" value={createDraft.po} onChange={(value) => setCreateDraft({ ...createDraft, po: value })} />
              <FormField label="Sales Rep" value={createDraft.salesRep} onChange={(value) => setCreateDraft({ ...createDraft, salesRep: value })} />
              <FormField label="Payment Info" value={createDraft.payment} onChange={(value) => setCreateDraft({ ...createDraft, payment: value })} />
              <FormField label="Ship Method" value={createDraft.shipMethod} onChange={(value) => setCreateDraft({ ...createDraft, shipMethod: value })} />
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <div className="font-title text-base font-semibold text-primaryText">Line Items</div>
              <Button variant="secondary" size="small" onClick={addCreateLine}>Add Line</Button>
            </div>
            <div className="rounded-xl bg-warningBg p-3 text-xs text-warningText">
              Use line items for products and shipping charges. For shipping, enter SKU SHIPPING, Qty 1, and the shipping amount as Unit Price.
            </div>

            {createDraft.items.map((item, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-border bg-page p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-primaryText">Line {index + 1}</div>
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={createDraft.items.length === 1}
                    onClick={() => removeCreateLine(index)}
                  >
                    Remove
                  </Button>
                </div>
                <FormField
                  label="SKU Code *"
                  value={item.sku}
                  placeholder="SKU code or SHIPPING"
                  onChange={(value) => updateCreateLine(index, { sku: value })}
                />
                <FormField
                  label="Description *"
                  value={item.description}
                  placeholder="Product description, shipping method, or shipping charge note"
                  onChange={(value) => updateCreateLine(index, { description: value })}
                  multiline
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    label="Width"
                    value={item.width}
                    placeholder="Optional for product lines; leave blank for shipping"
                    onChange={(value) => updateCreateLine(index, { width: value })}
                  />
                  <FormField
                    label="Length"
                    value={item.length}
                    placeholder="Optional for product lines; leave blank for shipping"
                    onChange={(value) => updateCreateLine(index, { length: value })}
                  />
                  <FormField
                    label="Category"
                    value={item.category}
                    placeholder="Product category or Shipping"
                    onChange={(value) => updateCreateLine(index, { category: value })}
                  />
                  <FormField
                    label="Qty"
                    type="number"
                    value={item.qty}
                    placeholder="Quantity, or 1 for shipping"
                    onChange={(value) => updateCreateLine(index, { qty: Number(value) })}
                  />
                  <FormField
                    label="Unit Price"
                    value={item.unitPrice}
                    placeholder="Unit price or shipping amount"
                    onChange={(value) => updateCreateLine(index, { unitPrice: Number(value) })}
                  />
                </div>
                <div className="rounded-xl bg-white p-3 text-sm text-primaryText">
                  Line Total: {formatCurrency(Number(item.qty || 0) * Number(item.unitPrice || 0))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Drawer>

      <Drawer
        title={lineDrawerMode === 'add' ? 'Add Item' : 'Edit Line Item'}
        helper={
          lineDrawerMode === 'add'
            ? 'Add a product line or shipping charge to this Sales Order. Use SKU SHIPPING and Qty 1 for shipping.'
            : 'Line item changes update this Sales Order only. They do not update Inventory master data.'
        }
        open={Boolean(draftLine)}
        onClose={() => {
          if (isSavingLine) return;
          setEditingLine(null);
          setDraftLine(null);
          setLineOrder(null);
          setLineError('');
        }}
        onSave={saveLineDraft}
      >
        {draftLine ? (
          <div className="grid gap-4">
            {lineError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {lineError}
              </div>
            ) : null}
            {isSavingLine ? (
              <div className="rounded-xl border border-border bg-page p-3 text-xs text-secondaryText">
                Saving line item to database...
              </div>
            ) : null}
            <FormField
              label="SKU Code"
              value={draftLine.sku}
              placeholder={lineDrawerMode === 'add' ? 'SKU code or SHIPPING' : undefined}
              onChange={(value) => setDraftLine({ ...draftLine, sku: value })}
            />
            <FormField
              label="Description"
              value={draftLine.description}
              placeholder={lineDrawerMode === 'add' ? 'Product description, shipping method, or shipping charge note' : undefined}
              onChange={(value) => setDraftLine({ ...draftLine, description: value })}
              multiline
            />
            <FormField
              label="Width"
              value={draftLine.width}
              placeholder={lineDrawerMode === 'add' ? 'Optional for product lines; leave blank for shipping' : undefined}
              onChange={(value) => setDraftLine({ ...draftLine, width: value })}
            />
            <FormField
              label="Length"
              value={draftLine.length}
              placeholder={lineDrawerMode === 'add' ? 'Optional for product lines; leave blank for shipping' : undefined}
              onChange={(value) => setDraftLine({ ...draftLine, length: value })}
            />
            <FormField
              label="Category"
              value={draftLine.category}
              placeholder={lineDrawerMode === 'add' ? 'Product category or Shipping' : undefined}
              onChange={(value) => setDraftLine({ ...draftLine, category: value })}
            />
            <FormField
              label={lineDrawerMode === 'add' ? 'Qty' : 'Qty (CTN)'}
              type="number"
              value={draftLine.qty}
              placeholder={lineDrawerMode === 'add' ? 'Quantity, or 1 for shipping' : undefined}
              onChange={(value) => setDraftLine({ ...draftLine, qty: Number(value) })}
            />
            <FormField
              label="Unit Price"
              value={draftLine.unitPrice}
              placeholder={lineDrawerMode === 'add' ? 'Unit price or shipping amount' : undefined}
              onChange={(value) => setDraftLine({ ...draftLine, unitPrice: Number(value) })}
            />
            <div className="rounded-xl bg-page p-3 text-sm text-primaryText">
              Preview Total: {formatCurrency(Number(draftLine.qty || 0) * Number(draftLine.unitPrice || 0))}
            </div>
            <div className="rounded-xl bg-warningBg p-3 text-xs text-warningText">
              For shipping, use SKU SHIPPING, Qty 1, and enter the shipping charge as Unit Price. Inventory is not deducted in this v1 flow.
            </div>
          </div>
        ) : null}
      </Drawer>
    </AppShell>
  );
}
