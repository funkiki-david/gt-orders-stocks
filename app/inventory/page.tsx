'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Drawer } from '@/components/Drawer';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { SearchBar } from '@/components/SearchBar';
import type { InventoryItem } from '@/lib/types';

type InventorySortKey = 'sku-asc' | 'sku-desc' | 'description-asc' | 'description-desc' | 'qty-desc' | 'qty-asc' | 'category-asc';

type ProductRecord = {
  id: string;
  skuCode: string;
  productName: string;
  category: string | null;
  qtyCtn: number;
  palletLocation: string | null;
  sellingPrice: string | number | null;
};

type ProductsResponse =
  | {
      ok: true;
      data: ProductRecord[];
    }
  | {
      ok: false;
      error: string;
    };

type ProductMutationResponse =
  | {
      ok: true;
      data: ProductRecord;
    }
  | {
      ok: false;
      error: string;
    };

type InventoryProductItem = InventoryItem & {
  id: string;
};

type EditingActivity = {
  id: string;
  sku: string;
  actor: string;
  action: 'Added' | 'Edited';
  summary: string;
  timestamp: string;
};

const categoryOptions = ['Standard', 'Short Size', 'Sample'] as const;

function productToInventoryItem(product: ProductRecord): InventoryProductItem {
  return {
    id: product.id,
    sku: product.skuCode,
    name: product.productName,
    category: product.category ?? '',
    qty: product.qtyCtn,
    palletLocation: product.palletLocation ?? '',
  };
}

function sortInventory<T extends InventoryItem>(items: T[], sortKey: InventorySortKey) {
  const sorted = [...items];

  sorted.sort((a, b) => {
    switch (sortKey) {
      case 'sku-asc':
        return a.sku.localeCompare(b.sku);
      case 'sku-desc':
        return b.sku.localeCompare(a.sku);
      case 'description-asc':
        return a.name.localeCompare(b.name);
      case 'description-desc':
        return b.name.localeCompare(a.name);
      case 'qty-desc':
        return Number(b.qty || 0) - Number(a.qty || 0);
      case 'qty-asc':
        return Number(a.qty || 0) - Number(b.qty || 0);
      case 'category-asc':
        return a.category.localeCompare(b.category);
      default:
        return 0;
    }
  });

  return sorted;
}

function readCurrentRole() {
  if (typeof document === 'undefined') return 'Unknown user';

  const roleCookie = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('gt_role='))
    ?.split('=')[1];

  return roleCookie ? decodeURIComponent(roleCookie) : 'Unknown user';
}

function describeProductChanges(previousItem: InventoryProductItem | null, nextItem: InventoryProductItem) {
  if (!previousItem) {
    return `Created SKU ${nextItem.sku}`;
  }

  const changes = [
    ['SKU Code', previousItem.sku, nextItem.sku],
    ['Product Description', previousItem.name, nextItem.name],
    ['Category', previousItem.category || 'Not set', nextItem.category || 'Not set'],
    ['Total Qty (CTN)', String(previousItem.qty), String(nextItem.qty)],
    ['Pallet Location', previousItem.palletLocation || 'Not set', nextItem.palletLocation || 'Not set'],
  ]
    .filter(([, before, after]) => before !== after)
    .map(([label, before, after]) => `${label}: ${before} -> ${after}`);

  return changes.length > 0 ? changes.join('; ') : 'Saved with no visible field changes';
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryProductItem[]>([]);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<InventorySortKey>('sku-asc');
  const [selectedSku, setSelectedSku] = useState<string>('');
  const [editingItem, setEditingItem] = useState<InventoryProductItem | null>(null);
  const [draft, setDraft] = useState<InventoryProductItem | null>(null);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [currentRole, setCurrentRole] = useState('Unknown user');
  const [editingActivities, setEditingActivities] = useState<EditingActivity[]>([]);

  const loadProducts = useCallback(async (preferredSku?: string) => {
    setIsLoadingProducts(true);
    setProductsError('');

    try {
      const response = await fetch('/api/products', {
        cache: 'no-store',
      });
      const result = (await response.json()) as ProductsResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.ok ? 'Failed to load products' : result.error);
      }

      const nextItems = result.data.map((product) => productToInventoryItem(product));

      setItems(nextItems);
      setSelectedSku((current) => {
        const nextSelection = preferredSku ?? current;
        if (nextSelection && nextItems.some((item) => item.sku === nextSelection)) {
          return nextSelection;
        }

        return nextItems[0]?.sku ?? '';
      });
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialProducts() {
      try {
        await loadProducts();
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setProductsError(error instanceof Error ? error.message : 'Failed to load products');
      }
    }

    loadInitialProducts();

    return () => {
      isMounted = false;
    };
  }, [loadProducts]);

  useEffect(() => {
    setCurrentRole(readCurrentRole());
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchedItems = normalizedQuery
      ? items.filter((item) =>
          [item.sku, item.name, item.category, item.palletLocation ?? '']
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : items;

    return sortInventory(matchedItems, sortKey);
  }, [items, query, sortKey]);

  const selectedItem = filteredItems.find((item) => item.sku === selectedSku) ?? filteredItems[0];
  const totalQty = filteredItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const standardCount = filteredItems.filter((item) => item.category === 'Standard').length;
  const palletLocationCount = filteredItems.filter((item) => item.palletLocation?.trim()).length;

  function selectItem(item: InventoryItem) {
    setSelectedSku(item.sku);
  }

  function handleSearch(value: string) {
    setQuery(value);
    const normalizedQuery = value.trim().toLowerCase();
    const firstMatch = sortInventory(items, sortKey).find((item) =>
      [item.sku, item.name, item.category, item.palletLocation ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );

    if (firstMatch) {
      setSelectedSku(firstMatch.sku);
    }
  }

  function handleSortChange(value: InventorySortKey) {
    setSortKey(value);
    const sorted = sortInventory(filteredItems, value);

    if (sorted.length > 0) {
      setSelectedSku(sorted[0].sku);
    }
  }

  function openEditDrawer(item: InventoryProductItem) {
    setEditingItem(item);
    setDraft({ ...item, palletLocation: item.palletLocation ?? '' });
    setSaveError('');
  }

  function openAddDrawer() {
    const blankItem: InventoryProductItem = {
      id: '',
      sku: '',
      name: '',
      category: 'Standard',
      qty: 0,
      palletLocation: '',
    };
    setEditingItem(null);
    setDraft(blankItem);
    setSaveError('');
  }

  async function saveDraft() {
    if (!draft) return;

    setIsSavingDraft(true);
    setSaveError('');

    try {
      const payload = {
        skuCode: draft.sku,
        productName: draft.name,
        category: draft.category,
        qtyCtn: draft.qty,
        palletLocation: draft.palletLocation ?? '',
      };
      const response = await fetch(editingItem ? `/api/products/${editingItem.id}` : '/api/products', {
        method: editingItem ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ProductMutationResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.ok ? 'Could not save product' : result.error);
      }

      const savedItem = productToInventoryItem(result.data);
      const activitySummary = describeProductChanges(editingItem, savedItem);
      const activity: EditingActivity = {
        id: `${result.data.id}-${Date.now()}`,
        sku: savedItem.sku,
        actor: currentRole,
        action: editingItem ? 'Edited' : 'Added',
        summary: activitySummary,
        timestamp: new Date().toISOString(),
      };

      setEditingActivities((current) => [
        activity,
        ...current,
      ].slice(0, 12));

      await loadProducts(result.data.skuCode);
      setDraft(null);
      setEditingItem(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save product');
    } finally {
      setIsSavingDraft(false);
    }
  }

  return (
    <AppShell>
      <PageHeader title="Inventory" instruction="Step 1: select a SKU from the left. Step 2: review or edit SKU details on the right." />

      <div className="mb-3 rounded-xl border border-border bg-card p-2.5 text-xs text-secondaryText">
        Product records load from PostgreSQL. Add and edit actions save to the database.
      </div>

      {isLoadingProducts ? (
        <div className="mb-3 rounded-xl border border-border bg-card p-3 text-sm text-secondaryText">
          Loading products from database...
        </div>
      ) : null}

      {productsError ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {productsError}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
        <div className="flex flex-wrap gap-4 text-[13px] text-primaryText">
          <span><strong>{filteredItems.length}</strong> SKU Records</span>
          <span><strong>{totalQty.toLocaleString()}</strong> Total Qty (CTN)</span>
          <span><strong>{standardCount}</strong> Standard</span>
          <span><strong>{palletLocationCount}</strong> Locations Set</span>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SearchBar value={query} onChange={handleSearch} placeholder="Search SKU / Product Description / Category / Pallet Location" />
        <Button variant="primary" onClick={openAddDrawer}>Add SKU</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[460px_1fr]">
        <section className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 rounded-xl bg-warningBg p-3 text-sm text-warningText">
            <strong>Step 1:</strong> Click a SKU below. The selected row turns bold and the detail opens on the right.
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="font-title text-base font-semibold text-primaryText">SKU List</div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-secondaryText" htmlFor="inventory-sort-left">Sort</label>
              <select
                id="inventory-sort-left"
                value={sortKey}
                onChange={(event) => handleSortChange(event.target.value as InventorySortKey)}
                className="h-8 rounded-full border border-border bg-white px-3 text-[13px] text-primaryText"
              >
                <option value="sku-asc">SKU: A-Z</option>
                <option value="sku-desc">SKU: Z-A</option>
                <option value="description-asc">Description: A-Z</option>
                <option value="description-desc">Description: Z-A</option>
                <option value="qty-desc">Qty: High</option>
                <option value="qty-asc">Qty: Low</option>
                <option value="category-asc">Category: A-Z</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-header">
                <tr>
                  <th className="h-9 w-[42%] border-b border-border px-2 text-left font-semibold text-primaryText">SKU</th>
                  <th className="h-9 w-[34%] border-b border-border px-2 text-left font-semibold text-primaryText">Category</th>
                  <th className="h-9 w-[24%] border-b border-border px-2 text-center font-semibold text-primaryText">Qty</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const isSelected = item.sku === selectedItem?.sku;

                  return (
                    <tr
                      key={item.sku}
                      onClick={() => selectItem(item)}
                      className={`cursor-pointer hover:bg-page ${isSelected ? 'bg-page font-semibold' : ''}`}
                    >
                      <td className="border-b border-border px-2 py-2 text-primaryText">{item.sku}</td>
                      <td className="border-b border-border px-2 py-2 text-primaryText">{item.category}</td>
                      <td className="border-b border-border px-2 py-2 text-center text-primaryText">{item.qty}</td>
                    </tr>
                  );
                })}
                {!isLoadingProducts && !productsError && filteredItems.length === 0 ? (
                  <tr>
                    <td className="border-b border-border px-2 py-4 text-center text-secondaryText" colSpan={3}>
                      No product records found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border-2 border-primaryButton/30 bg-white p-3">
          <div className="mb-3 rounded-xl bg-successBg p-3 text-sm text-successText">
            <strong>Step 2:</strong> Review the selected SKU here. Current selection: <strong>{selectedItem?.sku ?? 'None'}</strong>
          </div>
          <InventoryDetailPanel
            item={selectedItem}
            onEditItem={openEditDrawer}
            activities={editingActivities.filter((activity) => activity.sku === selectedItem?.sku)}
          />
        </section>
      </div>

      <Drawer
        title={editingItem ? 'Edit SKU' : 'Add SKU'}
        helper="SKU Code must be unique. Pallet Location is manually editable in v1."
        open={Boolean(draft)}
        onClose={() => {
          if (isSavingDraft) return;
          setDraft(null);
          setEditingItem(null);
          setSaveError('');
        }}
        onSave={saveDraft}
      >
        {draft ? (
          <div className="grid gap-4">
            {saveError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {saveError}
              </div>
            ) : null}
            {isSavingDraft ? (
              <div className="rounded-xl border border-border bg-page p-3 text-xs text-secondaryText">
                Saving product to database...
              </div>
            ) : null}
            <FormField label="SKU Code *" value={draft.sku} onChange={(value) => setDraft({ ...draft, sku: value })} />
            <FormField label="Product Description *" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-primaryText">Category</span>
              <select
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                className="h-[34px] w-full rounded-md border border-border bg-white px-3 text-sm text-primaryText"
              >
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <FormField
              label="Total Qty (CTN) *"
              type="number"
              value={draft.qty}
              onChange={(value) => setDraft({ ...draft, qty: Number(value) })}
            />
            <FormField
              label="Pallet Location"
              value={draft.palletLocation ?? ''}
              onChange={(value) => setDraft({ ...draft, palletLocation: value })}
            />
            <div className="rounded-xl bg-warningBg p-3 text-xs text-warningText">
              Product changes save to PostgreSQL. Sales order snapshots are not changed by product edits.
            </div>
          </div>
        ) : null}
      </Drawer>
    </AppShell>
  );
}

function InventoryDetailPanel({
  item,
  onEditItem,
  activities,
}: {
  item?: InventoryProductItem;
  onEditItem: (item: InventoryProductItem) => void;
  activities: EditingActivity[];
}) {
  if (!item) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-title text-[15px] font-semibold text-primaryText">SKU Detail</h2>
        <p className="mt-1 text-xs text-secondaryText">No SKU selected.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-title text-[15px] font-semibold text-primaryText">{item.sku}</h2>
          <p className="mt-0.5 text-xs text-helperText">SKU master data, inventory quantity, and pallet location.</p>
        </div>
        <Button onClick={() => onEditItem(item)}>Edit SKU</Button>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-page px-3 py-1.5 text-xs text-secondaryText">
        <span>Qty: {item.qty}</span>
        <span>Category: {item.category || '—'}</span>
        <span>Pallet Location: {item.palletLocation || 'Not set'}</span>
      </div>

      <div className="mb-3 rounded-lg border border-border bg-page p-3">
        <div className="mb-2 font-title text-[15px] font-semibold text-primaryText">SKU Profile</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <ReadOnlyField label="SKU Code" value={item.sku} />
          <ReadOnlyField label="Category" value={item.category || 'Not set'} />
          <ReadOnlyField label="Product Description" value={item.name} />
          <ReadOnlyField label="Total Qty (CTN)" value={String(item.qty)} />
          <ReadOnlyField label="Pallet Location" value={item.palletLocation || 'Not set'} />
          <ReadOnlyField label="Selling Price" value="Not set" />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-page p-3">
        <div className="mb-2 font-title text-[15px] font-semibold text-primaryText">Editing Activity</div>
        {activities.length > 0 ? (
          <div className="grid gap-2">
            {activities.map((activity) => (
              <div key={activity.id} className="rounded-md border border-border bg-white px-3 py-2 text-xs text-secondaryText">
                <div className="font-semibold text-primaryText">
                  {activity.actor} {activity.action.toLowerCase()} this SKU
                </div>
                <div>{activity.summary}</div>
                <div className="mt-1 text-helperText">{new Date(activity.timestamp).toLocaleString()}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-secondaryText">No edits recorded in this browser session yet.</p>
        )}
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
