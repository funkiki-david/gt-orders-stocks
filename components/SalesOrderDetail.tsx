'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SalesOrder, SalesOrderLineItem } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { Button } from './Button';
import { DataTable } from './DataTable';
import { StatusText } from './StatusText';

type SalesOrderDetailProps = {
  order?: SalesOrder;
  onAddLine?: (order: SalesOrder) => void;
  onEditLine: (line: SalesOrderLineItem) => void;
  onSaveDetails?: (order: SalesOrder, draft: SalesOrderDetailsDraft) => Promise<void>;
  onUpdateStatus?: (order: SalesOrder) => void;
};

export type SalesOrderDetailsDraft = {
  invoice: string;
  date: string;
  customer: string;
  po: string;
  payment: string;
  shipMethod: string;
};

function detailsDraftFromOrder(order: SalesOrder): SalesOrderDetailsDraft {
  return {
    invoice: order.invoice,
    date: order.date,
    customer: order.customer,
    po: order.po,
    payment: order.payment,
    shipMethod: order.shipMethod,
  };
}

export function SalesOrderDetail({ order, onAddLine, onEditLine, onSaveDetails, onUpdateStatus }: SalesOrderDetailProps) {
  const [detailsDraft, setDetailsDraft] = useState<SalesOrderDetailsDraft | null>(null);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  useEffect(() => {
    setDetailsDraft(order ? detailsDraftFromOrder(order) : null);
    setDetailsError('');
  }, [order?.id, order?.invoice]);

  const hasDetailsChanges = useMemo(() => {
    if (!order || !detailsDraft) return false;

    const current = detailsDraftFromOrder(order);

    return Object.entries(current).some(([key, value]) => detailsDraft[key as keyof SalesOrderDetailsDraft] !== value);
  }, [detailsDraft, order]);

  if (!order) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-title text-[15px] font-semibold">Selected Sales Order</h2>
        <p className="mt-1 text-xs text-secondaryText">No order selected.</p>
      </section>
    );
  }

  const fulfillmentStatus = order.fulfillmentStatus ?? 'Open';
  const paymentStatus = order.paymentStatus ?? (order.payment?.toLowerCase().includes('paid') ? 'Paid' : 'Unpaid');

  async function saveDetails() {
    if (!order || !detailsDraft || !onSaveDetails) return;

    setIsSavingDetails(true);
    setDetailsError('');

    try {
      await onSaveDetails(order, detailsDraft);
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : 'Could not save sales order details');
    } finally {
      setIsSavingDetails(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-title text-[15px] font-semibold text-primaryText">Selected Sales Order</h2>
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-border bg-page px-3 py-2 text-xs text-secondaryText">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium text-primaryText">Order Status</div>
          {onUpdateStatus ? (
            <Button variant="primary" size="small" onClick={() => onUpdateStatus(order)}>
              Update Status
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>Fulfillment: <StatusText kind="fulfillment" value={fulfillmentStatus} /></span>
          <span>Payment: <StatusText kind="payment" value={paymentStatus} /></span>
          {fulfillmentStatus === 'Cancelled' ? <span>Cancel Reason: {order.cancelReason || 'Not set'}</span> : null}
          {order.statusNotes ? <span>Notes: {order.statusNotes}</span> : null}
        </div>
      </div>

      {detailsError ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {detailsError}
        </div>
      ) : null}
      {isSavingDetails ? (
        <div className="mb-3 rounded-xl border border-border bg-page p-3 text-xs text-secondaryText">
          Saving sales order details...
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <EditableField
          label="Sales Order #"
          value={detailsDraft?.invoice ?? ''}
          onChange={(value) => setDetailsDraft((draft) => (draft ? { ...draft, invoice: value } : draft))}
        />
        <EditableField
          label="Order Date"
          type="date"
          value={detailsDraft?.date ?? ''}
          onChange={(value) => setDetailsDraft((draft) => (draft ? { ...draft, date: value } : draft))}
        />
        <EditableField
          label="Customer"
          value={detailsDraft?.customer ?? ''}
          onChange={(value) => setDetailsDraft((draft) => (draft ? { ...draft, customer: value } : draft))}
        />
        <EditableField
          label="PO #"
          value={detailsDraft?.po ?? ''}
          onChange={(value) => setDetailsDraft((draft) => (draft ? { ...draft, po: value } : draft))}
        />
        <EditableField
          label="Payment Info"
          value={detailsDraft?.payment ?? ''}
          onChange={(value) => setDetailsDraft((draft) => (draft ? { ...draft, payment: value } : draft))}
        />
        <EditableField
          label="Ship Method"
          value={detailsDraft?.shipMethod ?? ''}
          onChange={(value) => setDetailsDraft((draft) => (draft ? { ...draft, shipMethod: value } : draft))}
        />
      </div>
      {onSaveDetails ? (
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          <Button
            variant="primary"
            size="small"
            disabled={!hasDetailsChanges || isSavingDetails}
            onClick={saveDetails}
          >
            Save Details
          </Button>
          <Button
            size="small"
            disabled={!hasDetailsChanges || isSavingDetails}
            onClick={() => {
              setDetailsDraft(detailsDraftFromOrder(order));
              setDetailsError('');
            }}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      <DataTable
        rows={order.items}
        rowKey={(line, index) => `${line.sku}-${index}`}
        columns={[
          { key: 'sku', header: 'SKU', render: (line) => line.sku },
          { key: 'description', header: 'Description', render: (line) => line.description },
          { key: 'width', header: 'W', align: 'center', render: (line) => line.width },
          { key: 'length', header: 'L', align: 'center', render: (line) => line.length },
          { key: 'category', header: 'Category', render: (line) => line.category },
          { key: 'qty', header: 'Qty', align: 'center', render: (line) => line.qty },
          { key: 'unit', header: 'Unit', align: 'right', render: (line) => formatCurrency(line.unitPrice) },
          { key: 'total', header: 'Total', align: 'right', render: (line) => formatCurrency(line.total || line.qty * line.unitPrice) },
          {
            key: 'action',
            header: 'Action',
            align: 'center',
            render: (line) => (
              <Button size="small" onClick={() => onEditLine(line)}>
                Edit
              </Button>
            ),
          },
        ]}
      />

      {onAddLine ? (
        <div className="mt-3 flex justify-end">
          <Button size="small" onClick={() => onAddLine(order)}>
            Add Item
          </Button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-page px-3 py-2">
        <div className="text-xs text-secondaryText">Total Qty (CTN): <span className="text-primaryText">{order.totalQty}</span></div>
        <div className="text-xs text-secondaryText">Subtotal: <span className="text-primaryText">{formatCurrency(order.subtotal)}</span></div>
      </div>
    </section>
  );
}

function EditableField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-primaryText">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-md border border-border bg-white px-2 text-[13px] text-primaryText"
      />
    </label>
  );
}
