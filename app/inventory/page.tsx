'use client';

import { useMemo, useState } from 'react';
import inventorySeed from '@/data/inventory-seed.json';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { Drawer } from '@/components/Drawer';
import { FormField } from '@/components/FormField';
import { MetricCard } from '@/components/MetricCard';
import { PageHeader } from '@/components/PageHeader';
import { SearchBar } from '@/components/SearchBar';
import type { InventoryItem } from '@/lib/types';

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>(inventorySeed as InventoryItem[]);
  const [query, setQuery] = useState('');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [draft, setDraft] = useState<InventoryItem | null>(null);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) =>
      [item.sku, item.name, item.category].join(' ').toLowerCase().includes(normalizedQuery),
    );
  }, [items, query]);

  const totalQty = filteredItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const standardCount = filteredItems.filter((item) => item.category === 'Standard').length;
  const nonStandardCount = filteredItems.length - standardCount;

  function openEditDrawer(item: InventoryItem) {
    setEditingItem(item);
    setDraft({ ...item });
  }

  function openAddDrawer() {
    const blankItem: InventoryItem = {
      sku: '',
      name: '',
      category: 'Standard',
      qty: 0,
    };
    setEditingItem(null);
    setDraft(blankItem);
  }

  function saveDraft() {
    if (!draft) return;

    if (editingItem) {
      setItems((current) => current.map((item) => (item.sku === editingItem.sku ? draft : item)));
    } else {
      setItems((current) => [draft, ...current]);
    }

    setDraft(null);
    setEditingItem(null);
  }

  return (
    <AppShell>
      <PageHeader title="Inventory" instruction="Search SKU first. If the SKU does not exist, click Add SKU." />

      <div className="mb-4 rounded-xl border border-border bg-card p-3 text-xs text-secondaryText">
        Local seed data from La Mirada Warehouse SKU summary. Save updates local React state only.
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="SKU Records" value={filteredItems.length} />
        <MetricCard label="Total Qty (CTN)" value={totalQty.toLocaleString()} />
        <MetricCard label="Standard SKUs" value={standardCount} />
        <MetricCard label="Short / Sample SKUs" value={nonStandardCount} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Search SKU / Product Description / Category" />
        <Button variant="primary" onClick={openAddDrawer}>Add SKU</Button>
      </div>

      <DataTable
        rows={filteredItems}
        rowKey={(item) => item.sku}
        columns={[
          { key: 'sku', header: 'SKU Code', render: (item) => item.sku },
          { key: 'name', header: 'Product Description', render: (item) => item.name },
          { key: 'category', header: 'Category', render: (item) => item.category },
          { key: 'qty', header: 'Total Qty (CTN)', align: 'center', render: (item) => item.qty },
          {
            key: 'action',
            header: 'Action',
            align: 'center',
            render: (item) => (
              <Button size="small" onClick={() => openEditDrawer(item)}>
                Edit
              </Button>
            ),
          },
        ]}
      />

      <Drawer
        title={editingItem ? 'Edit SKU' : 'Add SKU'}
        helper="SKU Code must be unique. This MVP saves local state only."
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        onSave={saveDraft}
      >
        {draft ? (
          <div className="grid gap-4">
            <FormField label="SKU Code *" value={draft.sku} onChange={(value) => setDraft({ ...draft, sku: value })} />
            <FormField label="Product Description *" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
            <FormField label="Category" value={draft.category} onChange={(value) => setDraft({ ...draft, category: value })} />
            <FormField
              label="Total Qty (CTN) *"
              type="number"
              value={draft.qty}
              onChange={(value) => setDraft({ ...draft, qty: Number(value) })}
            />
            <div className="rounded-xl bg-warningBg p-3 text-xs text-warningText">
              This drawer is a front-end MVP. Future database updates should be added after workflow confirmation.
            </div>
          </div>
        ) : null}
      </Drawer>
    </AppShell>
  );
}
