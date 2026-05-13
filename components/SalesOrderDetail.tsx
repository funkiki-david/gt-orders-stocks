'use client';

import type { SalesOrder, SalesOrderLineItem } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { Button } from './Button';
import { DataTable } from './DataTable';
import { StatusText } from './StatusText';

type SalesOrderDetailProps = {
  order?: SalesOrder;
  onEditLine: (line: SalesOrderLineItem) => void;
  onUpdateStatus?: (order: SalesOrder) => void;
};

export function SalesOrderDetail({ order, onEditLine, onUpdateStatus }: SalesOrderDetailProps) {
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

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-title text-[15px] font-semibold text-primaryText">Selected Sales Order</h2>
          <p className="mt-0.5 text-xs text-helperText">Manual changes in a Sales Order do not update master data in v1.</p>
        </div>
        <div className="rounded-full bg-secondaryButton px-3 py-1.5 text-xs text-secondaryText">{order.items.length} line items</div>
      </div>

      <div className="mb-3 rounded-lg border border-border bg-page px-3 py-2 text-xs text-secondaryText">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium text-primaryText">Order Status</div>
          {onUpdateStatus ? <Button size="small" onClick={() => onUpdateStatus(order)}>Update Status</Button> : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>Fulfillment: <StatusText kind="fulfillment" value={fulfillmentStatus} /></span>
          <span>Payment: <StatusText kind="payment" value={paymentStatus} /></span>
          {fulfillmentStatus === 'Cancelled' ? <span>Cancel Reason: {order.cancelReason || 'Not set'}</span> : null}
          {order.statusNotes ? <span>Notes: {order.statusNotes}</span> : null}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <ReadOnlyField label="Sales Order #" value={order.invoice} />
        <ReadOnlyField label="Order Date" value={order.date} />
        <ReadOnlyField label="Customer" value={order.customer} />
        <ReadOnlyField label="PO #" value={order.po || '—'} />
        <ReadOnlyField label="Payment Info" value={order.payment || '—'} />
        <ReadOnlyField label="Ship Method" value={order.shipMethod || '—'} />
      </div>

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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-page px-3 py-2">
        <div className="text-xs text-secondaryText">Total Qty (CTN): <span className="text-primaryText">{order.totalQty}</span></div>
        <div className="text-xs text-secondaryText">Subtotal: <span className="text-primaryText">{formatCurrency(order.subtotal)}</span></div>
      </div>
    </section>
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
