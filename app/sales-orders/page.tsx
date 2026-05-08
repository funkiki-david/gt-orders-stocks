'use client';

import { useMemo, useState } from 'react';
import ordersSeed from '@/data/orders-seed.json';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { Drawer } from '@/components/Drawer';
import { FormField } from '@/components/FormField';
import { MetricCard } from '@/components/MetricCard';
import { PageHeader } from '@/components/PageHeader';
import { SalesOrderDetail } from '@/components/SalesOrderDetail';
import { SearchBar } from '@/components/SearchBar';
import { formatCurrency } from '@/lib/format';
import type { SalesOrder, SalesOrderLineItem } from '@/lib/types';

export default function SalesOrdersPage() {
  const [orders, setOrders] = useState<SalesOrder[]>(ordersSeed as SalesOrder[]);
  const [query, setQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<string>((ordersSeed as SalesOrder[])[0]?.invoice ?? '');
  const [editingLine, setEditingLine] = useState<SalesOrderLineItem | null>(null);
  const [draftLine, setDraftLine] = useState<SalesOrderLineItem | null>(null);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return orders;
    }

    return orders.filter((order) =>
      [
        order.invoice,
        order.customer,
        order.po,
        order.payment,
        order.items.map((item) => `${item.sku} ${item.description}`).join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [orders, query]);

  const selectedOrder = filteredOrders.find((order) => order.invoice === selectedInvoice) ?? filteredOrders[0];
  const salesTotal = filteredOrders.reduce((sum, order) => sum + Number(order.subtotal || 0), 0);
  const lineCount = filteredOrders.reduce((sum, order) => sum + order.items.length, 0);
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

  function handleSearch(value: string) {
    setQuery(value);
    const normalizedQuery = value.trim().toLowerCase();
    const firstMatch = orders.find((order) =>
      [
        order.invoice,
        order.customer,
        order.po,
        order.payment,
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

  return (
    <AppShell>
      <PageHeader title="Sales Order" instruction="Search an order, select it from the list, then review line items below." />

      <div className="mb-4 rounded-xl border border-border bg-card p-3 text-xs text-secondaryText">
        Sales Orders use local seed data grouped by invoice. Saving line edits updates React state only and does not deduct inventory.
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="Orders" value={filteredOrders.length} />
        <MetricCard label="Line Items" value={lineCount} />
        <MetricCard label="Customers" value={customerCount} />
        <MetricCard label="Sales Total" value={formatCurrency(salesTotal)} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchBar value={query} onChange={handleSearch} placeholder="Search Invoice / Customer / PO / SKU / Description" />
        <Button variant="primary" onClick={() => undefined}>Create Sales Order</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <DataTable
          rows={filteredOrders}
          rowKey={(order) => order.invoice}
          activeRowKey={selectedOrder?.invoice}
          onRowClick={(order) => setSelectedInvoice(order.invoice)}
          columns={[
            { key: 'invoice', header: 'Invoice #', render: (order) => order.invoice },
            { key: 'customer', header: 'Customer', render: (order) => order.customer },
            { key: 'total', header: 'Total', align: 'right', render: (order) => formatCurrency(order.subtotal) },
          ]}
        />

        <SalesOrderDetail order={selectedOrder} onEditLine={openLineDrawer} />
      </div>

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
