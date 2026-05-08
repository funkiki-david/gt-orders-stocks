'use client';

import type { SalesOrder, SalesOrderLineItem } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { Button } from './Button';
import { DataTable } from './DataTable';

type SalesOrderDetailProps = {
  order?: SalesOrder;
  onEditLine: (line: SalesOrderLineItem) => void;
};

export function SalesOrderDetail({ order, onEditLine }: SalesOrderDetailProps) {
  if (!order) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-title text-base font-semibold">Selected Sales Order</h2>
        <p className="mt-2 text-sm text-secondaryText">No order selected.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-title text-base font-semibold text-primaryText">Selected Sales Order</h2>
          <p className="mt-1 text-xs text-helperText">Manual changes in a Sales Order do not update master data in v1.</p>
        </div>
        <div className="rounded-full bg-secondaryButton px-3 py-1.5 text-xs text-secondaryText">{order.items.length} line items</div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ReadOnlyField label="Invoice #" value={order.invoice} />
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-page p-4">
        <div>
          <div className="text-xs text-secondaryText">Total Qty (CTN)</div>
          <div className="font-title text-lg font-semibold">{order.totalQty}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-secondaryText">Subtotal</div>
          <div className="font-title text-lg font-semibold">{formatCurrency(order.subtotal)}</div>
        </div>
      </div>
    </section>
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
