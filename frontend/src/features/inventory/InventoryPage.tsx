import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import type {
  ActivityEntry,
  DashboardSummary,
  InventoryMovement,
  PalletLocation,
  PalletStockItem,
  Reservation,
  SalesOrderDetail,
  SalesOrderSummary,
  Sku,
  SkuLocationBalance,
  Warehouse,
} from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { canManageProducts, canPostInventoryMovements, getCurrentRole } from "@/lib/permissions";

type PagedResponse<T> = {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

type SkuFormState = {
  skuCode: string;
  productName: string;
  category: string;
  unitCost: string;
  sellingPrice: string;
  reorderLevel: string;
  reorderQuantity: string;
  warehouseLocation: string;
};

type MovementFormState = {
  skuId: string;
  movementType: "INBOUND" | "OUTBOUND" | "ADJUSTMENT" | "TRANSFER";
  quantity: string;
  warehouseId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  palletLocationId: string;
  fromPalletLocationId: string;
  toPalletLocationId: string;
  referenceType: "" | "SALES_ORDER" | "PHYSICAL_COUNT" | "OTHER" | "TRANSFER_WH_LOCATION";
  referenceId: string;
  reason: string;
  notes: string;
  fromWarehouseLocation: string;
  toWarehouseLocation: string;
  fromPalletLocation: string;
  toPalletLocation: string;
};

type PalletFormState = {
  warehouseId: string;
  code: string;
  label: string;
  zone: string;
  notes: string;
  isActive: boolean;
};

type InventoryPageProps = {
  mode?: "products" | "actions" | "activity" | "pallets" | "low-stock";
};

function buildSkuUrl(input: {
  search: string;
  statusFilter: string;
  categoryFilter: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDirection: string;
}) {
  return `/inventory/skus?page=${input.page}&pageSize=${input.pageSize}&search=${encodeURIComponent(input.search)}${
    input.statusFilter ? `&status=${input.statusFilter}` : ""
  }${input.categoryFilter ? `&category=${encodeURIComponent(input.categoryFilter)}` : ""}&sortBy=${input.sortBy}&sortDirection=${input.sortDirection}`;
}

function buildMovementUrl(input: {
  search: string;
  movementTypeFilter: string;
  warehouseFilter: string;
  palletFilter: string;
  userFilter: string;
  dateFromFilter: string;
  dateToFilter: string;
  page: number;
  pageSize: number;
}) {
  return `/inventory/movements?page=${input.page}&pageSize=${input.pageSize}&search=${encodeURIComponent(input.search)}${
    input.movementTypeFilter ? `&movementType=${input.movementTypeFilter}` : ""
  }${input.warehouseFilter ? `&warehouseId=${input.warehouseFilter}` : ""}${
    input.palletFilter ? `&palletLocationId=${input.palletFilter}` : ""
  }${input.userFilter ? `&user=${encodeURIComponent(input.userFilter)}` : ""}${
    input.dateFromFilter ? `&dateFrom=${input.dateFromFilter}` : ""
  }${input.dateToFilter ? `&dateTo=${input.dateToFilter}` : ""}&sortBy=createdAt&sortDirection=desc`;
}

export function InventoryPage({ mode = "products" }: InventoryPageProps) {
  const role = getCurrentRole();
  const navigate = useNavigate();
  const canEditProducts = canManageProducts(role);
  const canCreateMovements = canPostInventoryMovements(role);
  const queryClient = useQueryClient();
  const routeParams = useParams();
  const [searchParams] = useSearchParams();
  const selectedSkuParam = routeParams.skuId ?? searchParams.get("sku") ?? "";
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [error, setError] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [skuStatusFilter] = useState("");
  const [skuCategoryFilter] = useState("");
  const [skuPage, setSkuPage] = useState(1);
  const [skuPageSize] = useState(10);
  const [skuSortBy] = useState("updatedAt");
  const [skuSortDirection] = useState("desc");
  const [movementSearch, setMovementSearch] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState("");
  const [movementWarehouseFilter, setMovementWarehouseFilter] = useState("");
  const [movementPalletFilter, setMovementPalletFilter] = useState("");
  const [movementUserFilter, setMovementUserFilter] = useState("");
  const [movementDateFromFilter, setMovementDateFromFilter] = useState("");
  const [movementDateToFilter, setMovementDateToFilter] = useState("");
  const [movementPage, setMovementPage] = useState(1);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [selectedPalletId, setSelectedPalletId] = useState("");
  const [isPalletModalOpen, setIsPalletModalOpen] = useState(false);
  const [editingPalletId, setEditingPalletId] = useState("");
  const movementPageSize = 12;
  const [isCreateProductOpen, setIsCreateProductOpen] = useState(false);
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [skuForm, setSkuForm] = useState<SkuFormState>({
    skuCode: "",
    productName: "",
    category: "",
    unitCost: "0.00",
    sellingPrice: "0.00",
    reorderLevel: "100",
    reorderQuantity: "500",
    warehouseLocation: "",
  });
  const [movementForm, setMovementForm] = useState<MovementFormState>({
    skuId: "",
    movementType: "INBOUND",
    quantity: "1",
    warehouseId: "",
    fromWarehouseId: "",
    toWarehouseId: "",
    palletLocationId: "",
    fromPalletLocationId: "",
    toPalletLocationId: "",
    referenceType: "",
    referenceId: "",
    reason: "",
    notes: "",
    fromWarehouseLocation: "",
    toWarehouseLocation: "",
    fromPalletLocation: "",
    toPalletLocation: "",
  });
  const [transferMode, setTransferMode] = useState<"WAREHOUSE" | "PALLET">("WAREHOUSE");
  const [palletForm, setPalletForm] = useState<PalletFormState>({
    warehouseId: "",
    code: "",
    label: "",
    zone: "",
    notes: "",
    isActive: true,
  });

  const isProductsMode = mode === "products";
  const isActionsMode = mode === "actions";
  const isActivityMode = mode === "activity";
  const isPalletsMode = mode === "pallets";
  const isLowStockMode = mode === "low-stock";

  const dashboardQuery = useQuery({
    queryKey: ["inventory-dashboard"],
    queryFn: () => apiFetch<DashboardSummary>("/inventory/dashboard"),
  });

  const warehousesQuery = useQuery({
    queryKey: ["inventory-warehouses"],
    queryFn: () => apiFetch<{ items: Warehouse[] }>("/inventory/warehouses"),
  });

  const skusQuery = useQuery({
    queryKey: [
      "skus",
      "inventory-page",
      skuSearch,
      skuStatusFilter,
      skuCategoryFilter,
      skuPage,
      skuPageSize,
      skuSortBy,
      skuSortDirection,
    ],
    queryFn: () =>
      apiFetch<PagedResponse<Sku>>(
        buildSkuUrl({
          search: skuSearch,
          statusFilter: skuStatusFilter,
          categoryFilter: skuCategoryFilter,
          page: skuPage,
          pageSize: skuPageSize,
          sortBy: skuSortBy,
          sortDirection: skuSortDirection,
        }),
      ),
  });

  const skuOptionsQuery = useQuery({
    queryKey: ["skus", "inventory-options"],
    queryFn: () => apiFetch<PagedResponse<Sku>>("/inventory/skus?page=1&pageSize=100&sortBy=skuCode&sortDirection=asc"),
  });

  const movementsQuery = useQuery({
    queryKey: [
      "movements",
      movementSearch,
      movementTypeFilter,
      movementWarehouseFilter,
      movementPalletFilter,
      movementUserFilter,
      movementDateFromFilter,
      movementDateToFilter,
      movementPage,
    ],
    queryFn: () =>
      apiFetch<PagedResponse<InventoryMovement>>(
        buildMovementUrl({
          search: movementSearch,
          movementTypeFilter,
          warehouseFilter: movementWarehouseFilter,
          palletFilter: movementPalletFilter,
          userFilter: movementUserFilter,
          dateFromFilter: movementDateFromFilter,
          dateToFilter: movementDateToFilter,
          page: movementPage,
          pageSize: movementPageSize,
        }),
      ),
  });

  const lowStockQuery = useQuery({
    queryKey: ["low-stock"],
    queryFn: () => apiFetch<{ items: Sku[] }>("/inventory/low-stock"),
  });

  const palletLocationsQuery = useQuery({
    queryKey: ["inventory-pallet-locations"],
    queryFn: () => apiFetch<{ items: PalletLocation[] }>("/inventory/pallet-locations"),
  });

  const palletStockQuery = useQuery({
    queryKey: ["inventory-pallet-stock", selectedPalletId],
    queryFn: () => apiFetch<{ palletLocation: PalletLocation; items: PalletStockItem[] }>(`/inventory/pallet-locations/${selectedPalletId}/stock`),
    enabled: Boolean(selectedPalletId),
  });

  const confirmedOrdersQuery = useQuery({
    queryKey: ["confirmed-orders"],
    queryFn: () =>
      apiFetch<PagedResponse<SalesOrderSummary>>("/sales/orders?page=1&pageSize=100&status=CONFIRMED"),
  });

  const selectedShipOrderQuery = useQuery({
    queryKey: ["ship-order-detail", movementForm.referenceId],
    queryFn: () => apiFetch<SalesOrderDetail>(`/sales/orders/${movementForm.referenceId}`),
    enabled: movementForm.movementType === "OUTBOUND" && Boolean(movementForm.referenceId),
  });

  const skuHistoryQuery = useQuery({
    queryKey: ["sku-history", selectedSkuId],
    queryFn: () => apiFetch<PagedResponse<InventoryMovement>>(`/inventory/skus/${selectedSkuId}/history?page=1&pageSize=20`),
    enabled: Boolean(selectedSkuId),
  });

  const skuActivityQuery = useQuery({
    queryKey: ["sku-activity", selectedSkuId],
    queryFn: () =>
      apiFetch<PagedResponse<ActivityEntry>>(`/inventory/skus/${selectedSkuId}/activity?page=1&pageSize=20`),
    enabled: Boolean(selectedSkuId),
  });

  const skuLocationBalancesQuery = useQuery({
    queryKey: ["sku-location-balances", selectedSkuId],
    queryFn: () => apiFetch<{ items: SkuLocationBalance[] }>(`/inventory/skus/${selectedSkuId}/location-balances`),
    enabled: Boolean(selectedSkuId),
  });

  const actionSkuLocationBalancesQuery = useQuery({
    queryKey: ["action-sku-location-balances", movementForm.skuId],
    queryFn: () => apiFetch<{ items: SkuLocationBalance[] }>(`/inventory/skus/${movementForm.skuId}/location-balances`),
    enabled: isActionsMode && Boolean(movementForm.skuId),
  });

  const createPalletMutation = useMutation({
    mutationFn: async () =>
      apiFetch<PalletLocation>("/inventory/pallet-locations", {
        method: "POST",
        body: JSON.stringify({
          warehouseId: palletForm.warehouseId,
          code: palletForm.code,
          label: palletForm.label,
          zone: palletForm.zone || undefined,
          notes: palletForm.notes || undefined,
          isActive: palletForm.isActive,
        }),
      }),
    onSuccess: async () => {
      setError("");
      setIsPalletModalOpen(false);
      setEditingPalletId("");
      setPalletForm({
        warehouseId: selectedWarehouseId,
        code: "",
        label: "",
        zone: "",
        notes: "",
        isActive: true,
      });
      await queryClient.invalidateQueries({ queryKey: ["inventory-pallet-locations"] });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Could not create pallet location");
    },
  });

  const updatePalletMutation = useMutation({
    mutationFn: async () =>
      apiFetch<PalletLocation>(`/inventory/pallet-locations/${editingPalletId}`, {
        method: "PUT",
        body: JSON.stringify({
          warehouseId: palletForm.warehouseId,
          code: palletForm.code,
          label: palletForm.label,
          zone: palletForm.zone || undefined,
          notes: palletForm.notes || undefined,
          isActive: palletForm.isActive,
        }),
      }),
    onSuccess: async () => {
      setError("");
      setIsPalletModalOpen(false);
      setEditingPalletId("");
      await queryClient.invalidateQueries({ queryKey: ["inventory-pallet-locations"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory-pallet-stock"] });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Could not update pallet location");
    },
  });

  const deletePalletMutation = useMutation({
    mutationFn: async (palletId: string) =>
      apiFetch<void>(`/inventory/pallet-locations/${palletId}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setError("");
      setIsPalletModalOpen(false);
      setEditingPalletId("");
      await queryClient.invalidateQueries({ queryKey: ["inventory-pallet-locations"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory-pallet-stock"] });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Could not delete pallet location");
    },
  });

  const selectedSkuQuery = useQuery({
    queryKey: ["selected-sku", selectedSkuId],
    queryFn: () => apiFetch<Sku>(`/inventory/skus/${selectedSkuId}`),
    enabled: Boolean(selectedSkuId),
  });

  const createSkuMutation = useMutation({
    mutationFn: async () =>
      apiFetch<Sku>("/inventory/skus", {
        method: "POST",
        body: JSON.stringify({
          ...skuForm,
          unit: "piece",
          unitCost: Number(skuForm.unitCost),
          sellingPrice: Number(skuForm.sellingPrice),
          reorderLevel: Number(skuForm.reorderLevel),
          reorderQuantity: Number(skuForm.reorderQuantity),
          status: "ACTIVE",
        }),
      }),
    onSuccess: async () => {
      setError("");
      setIsCreateProductOpen(false);
      setSkuForm({
        skuCode: "",
        productName: "",
        category: "",
        unitCost: "0.00",
        sellingPrice: "0.00",
        reorderLevel: "100",
        reorderQuantity: "500",
        warehouseLocation: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["skus"] });
      await queryClient.invalidateQueries({ queryKey: ["selected-sku"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory-dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["low-stock"] });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Could not create SKU");
    },
  });

  const createMovementMutation = useMutation({
    mutationFn: async () =>
      apiFetch<{ movement: InventoryMovement; sku: Sku }>("/inventory/movements", {
        method: "POST",
        body: JSON.stringify({
          skuId: movementForm.skuId,
          movementType: movementForm.movementType,
          quantity: Number(movementForm.quantity),
          warehouseId: movementForm.warehouseId || undefined,
          fromWarehouseId: movementForm.fromWarehouseId || undefined,
          toWarehouseId: movementForm.toWarehouseId || undefined,
          palletLocationId: movementForm.palletLocationId || undefined,
          fromPalletLocationId: movementForm.fromPalletLocationId || undefined,
          toPalletLocationId: movementForm.toPalletLocationId || undefined,
          referenceType: movementForm.referenceType || undefined,
          referenceId: movementForm.referenceId || undefined,
          reason: movementForm.reason || undefined,
          notes: movementForm.notes || undefined,
          fromWarehouseLocation: movementForm.fromWarehouseLocation || undefined,
          toWarehouseLocation: movementForm.toWarehouseLocation || undefined,
          fromPalletLocation: movementForm.fromPalletLocation || undefined,
          toPalletLocation: movementForm.toPalletLocation || undefined,
        }),
      }),
    onSuccess: async () => {
      setError("");
      setMovementForm((current) => ({
        ...current,
        quantity: "1",
        palletLocationId: "",
        fromPalletLocationId: "",
        toPalletLocationId: "",
        referenceId: "",
        reason: "",
        notes: "",
        fromWarehouseLocation: "",
        toWarehouseLocation: "",
        fromPalletLocation: "",
        toPalletLocation: "",
      }));
      await queryClient.invalidateQueries({ queryKey: ["skus"] });
      await queryClient.invalidateQueries({ queryKey: ["selected-sku"] });
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
      await queryClient.invalidateQueries({ queryKey: ["sku-history"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory-dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["low-stock"] });
      await queryClient.invalidateQueries({ queryKey: ["confirmed-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory-pallet-stock"] });
      await queryClient.invalidateQueries({ queryKey: ["sku-location-balances"] });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Could not create movement");
    },
  });

  useEffect(() => {
    const firstSku = skuOptionsQuery.data?.items[0];

    if (selectedSkuParam && selectedSkuParam !== selectedSkuId) {
      setSelectedSkuId(selectedSkuParam);
      return;
    }

    if (firstSku && !selectedSkuId) {
      setSelectedSkuId(firstSku.id);
    }

    if (firstSku && !movementForm.skuId) {
      setMovementForm((current) => ({ ...current, skuId: firstSku.id }));
    }
  }, [movementForm.skuId, selectedSkuId, selectedSkuParam, skuOptionsQuery.data]);

  useEffect(() => {
    const warehouses = warehousesQuery.data?.items ?? [];
    if (!warehouses.length) {
      return;
    }

    const laMirada = warehouses.find((warehouse) => warehouse.code === "LA_MIRADA");
    const defaultWarehouseId = laMirada?.id ?? warehouses[0].id;

    if (!selectedWarehouseId) {
      setSelectedWarehouseId(defaultWarehouseId);
    }

    setMovementForm((current) => ({
      ...current,
      warehouseId: current.warehouseId || defaultWarehouseId,
      fromWarehouseId: current.fromWarehouseId || defaultWarehouseId,
      toWarehouseId: current.toWarehouseId || defaultWarehouseId,
    }));
    setPalletForm((current) => ({
      ...current,
      warehouseId: current.warehouseId || defaultWarehouseId,
    }));
  }, [selectedWarehouseId, warehousesQuery.data]);

  useEffect(() => {
    const pallets = palletLocationsQuery.data?.items ?? [];
    if (!pallets.length) {
      setSelectedPalletId("");
      return;
    }

    if (!selectedPalletId || !pallets.some((pallet) => pallet.id === selectedPalletId)) {
      setSelectedPalletId(pallets[0].id);
    }
  }, [palletLocationsQuery.data, selectedPalletId]);

  useEffect(() => {
    setSkuPage(1);
  }, [skuSearch, skuStatusFilter, skuCategoryFilter, skuPageSize, skuSortBy, skuSortDirection]);

  useEffect(() => {
    setMovementPage(1);
  }, [movementSearch, movementTypeFilter, movementWarehouseFilter, movementPalletFilter, movementUserFilter, movementDateFromFilter, movementDateToFilter]);

  function handleCreateSku(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createSkuMutation.mutate();
  }

  function handleCreateMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMovementMutation.mutate();
  }

  function openInventoryAction(
    movementType: MovementFormState["movementType"],
    options: Partial<MovementFormState> = {},
  ) {
    if (movementType === "TRANSFER") {
      setTransferMode(options.fromPalletLocationId || options.toPalletLocationId ? "PALLET" : "WAREHOUSE");
    }

    setMovementForm((current) => ({
      ...current,
      movementType,
      skuId: options.skuId ?? selectedSkuId ?? current.skuId,
      quantity: options.quantity ?? current.quantity,
      warehouseId: options.warehouseId ?? current.warehouseId,
      fromWarehouseId: options.fromWarehouseId ?? current.fromWarehouseId,
      toWarehouseId: options.toWarehouseId ?? current.toWarehouseId,
      palletLocationId: options.palletLocationId ?? current.palletLocationId,
      fromPalletLocationId: options.fromPalletLocationId ?? current.fromPalletLocationId,
      toPalletLocationId: options.toPalletLocationId ?? current.toPalletLocationId,
      referenceType:
        options.referenceType ??
        (movementType === "TRANSFER"
          ? "TRANSFER_WH_LOCATION"
          : movementType === "OUTBOUND"
            ? "SALES_ORDER"
            : movementType === "ADJUSTMENT"
              ? "PHYSICAL_COUNT"
              : current.referenceType === "TRANSFER_WH_LOCATION"
                ? ""
                : current.referenceType),
      referenceId: options.referenceId ?? (movementType === "TRANSFER" ? "" : current.referenceId),
      reason:
        options.reason ??
        (movementType === "INBOUND"
          ? "Receiving"
          : movementType === "OUTBOUND"
            ? "Ship out"
            : movementType === "ADJUSTMENT"
              ? "Physical count adjustment"
              : "Location transfer"),
    }));
    navigate("/inventory/actions");
  }

  function handleSavePalletLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingPalletId) {
      updatePalletMutation.mutate();
      return;
    }

    createPalletMutation.mutate();
  }

  function openNewPalletModal() {
    setEditingPalletId("");
    setPalletForm({
      warehouseId: selectedWarehouseId,
      code: "",
      label: "",
      zone: "",
      notes: "",
      isActive: true,
    });
    setIsPalletModalOpen(true);
  }

  function openEditPalletModal(pallet: PalletLocation) {
    setEditingPalletId(pallet.id);
    setPalletForm({
      warehouseId: pallet.warehouseId,
      code: pallet.code,
      label: pallet.label,
      zone: pallet.zone ?? "",
      notes: pallet.notes ?? "",
      isActive: pallet.isActive,
    });
    setIsPalletModalOpen(true);
  }

  const selectedSku = selectedSkuQuery.data;
  useEffect(() => {
    if (!selectedSku || movementForm.movementType !== "TRANSFER") {
      return;
    }

    setMovementForm((current) => ({
      ...current,
      fromWarehouseLocation: current.fromWarehouseLocation || selectedSku.warehouseLocation || "",
      referenceType:
        current.referenceType && current.referenceType !== "TRANSFER_WH_LOCATION"
          ? "TRANSFER_WH_LOCATION"
          : current.referenceType || "TRANSFER_WH_LOCATION",
    }));
  }, [movementForm.movementType, selectedSku]);

  useEffect(() => {
    const warehouse = warehousesQuery.data?.items.find((item) => item.id === movementForm.warehouseId);

    if (!warehouse?.isPalletTracked && movementForm.palletLocationId) {
      setMovementForm((current) => ({ ...current, palletLocationId: "" }));
    }
  }, [movementForm.palletLocationId, movementForm.warehouseId, warehousesQuery.data]);
  const skuOptions = skuOptionsQuery.data?.items ?? [];
  const warehouses = warehousesQuery.data?.items ?? [];
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === selectedWarehouseId);
  const movementWarehouse = warehouses.find((warehouse) => warehouse.id === movementForm.warehouseId);
  const movementFromWarehouse = warehouses.find((warehouse) => warehouse.id === movementForm.fromWarehouseId);
  const movementToWarehouse = warehouses.find((warehouse) => warehouse.id === movementForm.toWarehouseId);
  const allPalletLocations = palletLocationsQuery.data?.items ?? [];
  const palletLocations = allPalletLocations.filter((pallet) => pallet.warehouseId === selectedWarehouseId);
  const movementWarehousePallets = allPalletLocations.filter((pallet) => pallet.warehouseId === movementForm.warehouseId);
  const movementFromPallets = allPalletLocations.filter((pallet) => pallet.warehouseId === movementForm.fromWarehouseId);
  const movementToPallets = allPalletLocations.filter((pallet) => pallet.warehouseId === movementForm.toWarehouseId);
  const totalSkuPages = Math.max(1, Math.ceil((skusQuery.data?.pagination.total ?? 0) / skuPageSize));
  const totalMovementPages = Math.max(1, Math.ceil((movementsQuery.data?.pagination.total ?? 0) / movementPageSize));
  const selectedShipOrder = selectedShipOrderQuery.data;
  const selectedShipOrderReservations: Reservation[] = selectedShipOrder?.reservations.filter(
    (reservation) => reservation.status === "ACTIVE" && reservation.quantityReserved > 0,
  ) ?? [];
  const selectedShipReservation = selectedShipOrderReservations.find(
    (reservation) => reservation.skuId === movementForm.skuId,
  );
  const selectedShipLine = selectedShipOrder?.lines.find((line) => line.skuId === movementForm.skuId);
  const actionSkuBalances = actionSkuLocationBalancesQuery.data?.items ?? [];
  const pickablePalletBalances = actionSkuBalances.filter(
    (balance) =>
      balance.warehouseId === movementForm.warehouseId &&
      Boolean(balance.palletLocationId) &&
      balance.available > 0,
  );
  const warehouseLevelActionBalance = actionSkuBalances.find(
    (balance) => balance.warehouseId === movementForm.warehouseId && !balance.palletLocationId,
  );

  useEffect(() => {
    if (movementForm.movementType !== "OUTBOUND" || !selectedShipOrder) {
      return;
    }

    const currentReservation = selectedShipOrder.reservations.find(
      (reservation) =>
        reservation.skuId === movementForm.skuId &&
        reservation.status === "ACTIVE" &&
        reservation.quantityReserved > 0,
    );
    const nextReservation =
      currentReservation ??
      selectedShipOrder.reservations.find(
        (reservation) => reservation.status === "ACTIVE" && reservation.quantityReserved > 0,
      );

    if (!nextReservation) {
      return;
    }

    setMovementForm((current) => ({
      ...current,
      skuId: nextReservation.skuId,
      quantity: current.referenceId === selectedShipOrder.id ? String(nextReservation.quantityReserved) : current.quantity,
    }));
  }, [movementForm.movementType, movementForm.skuId, selectedShipOrder]);

  function warehouseNameById(warehouseId: string) {
    return warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? "";
  }

  function palletLabelById(palletId: string) {
    const pallet = allPalletLocations.find((item) => item.id === palletId);
    return pallet ? `${pallet.code}${pallet.zone ? ` · ${pallet.zone}` : ""}` : "";
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">
            {isProductsMode
              ? "Stock Overview"
              : isActionsMode
                ? "Inventory Actions"
                : isActivityMode
                  ? "Activity Log"
                  : isPalletsMode
                    ? "Pallet Locations"
                    : "Low Stock"}
          </h2>
          <p className="text-sm text-neutral-500">
            {isProductsMode
              ? "Review SKU stock, availability, reservations, and where each item is physically stored."
              : isActionsMode
                ? "Receive stock, correct counts, transfer locations, and ship out inventory through controlled movement records."
                : isActivityMode
                  ? "Trace inventory changes across SKU, warehouse, pallet, order reference, user, and movement type."
                  : isPalletsMode
                    ? "Inspect pallet locations as stock containers and see which SKUs and quantities sit inside each location."
                    : "Monitor replenishment risk, prioritize shortages, and jump from low stock into stock investigation."}
          </p>
        </div>
        {!isActivityMode ? (
          <div className="flex flex-wrap gap-2">
            <WorkflowNavLink active={isProductsMode} label="1. Find Stock" to="/inventory/stock-overview" />
            <WorkflowNavLink active={isActionsMode} label="2. Do Action" to="/inventory/actions" />
            <WorkflowNavLink active={isPalletsMode} label="3. Check Pallet" to="/inventory/pallet-locations" />
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {isProductsMode ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_1.2fr]">
          <div className="space-y-6">
            <ProductsQueueCard
              navigate={navigate}
              page={skuPage}
              selectedSkuId={selectedSkuId}
              setPage={setSkuPage}
              setSearch={setSkuSearch}
              setSelectedSkuId={setSelectedSkuId}
              skuSearch={skuSearch}
              skus={skusQuery.data?.items ?? []}
              totalPages={totalSkuPages}
              totalSkus={skusQuery.data?.pagination.total ?? 0}
            />
          </div>

          <div className="space-y-6">
            {selectedSku ? (
              <div className="space-y-6 rounded-xl border border-neutral-200 p-5">
                <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-[linear-gradient(135deg,#f8faf7_0%,#eef4ec_100%)] px-5 py-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">SKU Stock Profile</p>
                      <h3 className="mt-2 text-2xl font-semibold">{selectedSku.skuCode}</h3>
                      <p className="mt-1 text-sm text-neutral-600">{selectedSku.productName}</p>
                      <p className="mt-2 text-sm text-neutral-500">
                        Category {selectedSku.category} · Location {selectedSku.warehouseLocation ?? "Unassigned"}
                      </p>
                    </div>
                    <StatusBadge>{selectedSku.status}</StatusBadge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-neutral-200 pb-4 text-sm">
                  <InlineStockStat label="QOH" value={String(selectedSku.quantityOnHand)} />
                  <InlineStockStat label="Reserved" value={String(selectedSku.quantityReserved)} />
                  <InlineStockStat label="Available" value={String(selectedSku.available)} />
                  <InlineStockStat label="Category" value={selectedSku.category} />
                  <InlineStockStat label="Unit" value={selectedSku.unit} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    onClick={() => openInventoryAction("OUTBOUND", { skuId: selectedSku.id })}
                    type="button"
                  >
                    Ship Out
                  </button>
                  <button
                    className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                    onClick={() => openInventoryAction("TRANSFER", { skuId: selectedSku.id })}
                    type="button"
                  >
                    Transfer Location
                  </button>
                  <button
                    className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100"
                    onClick={() => openInventoryAction("INBOUND", { skuId: selectedSku.id })}
                    type="button"
                  >
                    Add Inventory
                  </button>
                  <button
                    className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    onClick={() => openInventoryAction("ADJUSTMENT", { skuId: selectedSku.id })}
                    type="button"
                  >
                    Adjust Quantity
                  </button>
                  <button
                    className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                    onClick={() =>
                      navigate(`/sales/orders?sku=${selectedSku.id}&skuLabel=${encodeURIComponent(selectedSku.skuCode)}&from=stock`)
                    }
                    type="button"
                  >
                    View Sales Orders
                  </button>
                  {canEditProducts ? (
                    <button
                      className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                      onClick={() => setIsCreateProductOpen(true)}
                      type="button"
                    >
                      Add SKU
                    </button>
                  ) : null}
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold">Activity & Audit</h4>
                    <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                      {skuActivityQuery.data?.pagination.total ?? 0} events
                    </span>
                  </div>
                  <div className="mt-3 rounded-xl border border-neutral-200 bg-white">
                    <div className="divide-y divide-neutral-200">
                      {skuActivityQuery.data?.items.map((entry) => (
                        <div key={entry.id} className="px-5 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                                  {entry.action.split("_").join(" ")}
                                </span>
                                <p className="text-sm font-medium text-neutral-800">
                                  {entry.userName ?? entry.userId}
                                </p>
                              </div>
                              <p className="mt-2 text-sm text-neutral-500">
                                {formatActivityChanges(entry.changes)}
                              </p>
                            </div>
                            <p className="text-xs uppercase tracking-wide text-neutral-400">
                              {new Date(entry.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                      {!skuActivityQuery.data?.items.length ? (
                        <div className="px-5 py-6 text-sm text-neutral-500">No activity recorded for this product yet.</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500">
                Open Stock Search and choose a SKU to inspect availability, locations, and movement history.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {isActionsMode ? (
        <div className="grid gap-6">
          {canCreateMovements ? (
          <form className="space-y-4 rounded-xl border border-neutral-200 p-4" onSubmit={handleCreateMovement}>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-semibold">Inventory Action</h3>
              <span className="text-sm text-neutral-500">Pick one task, fill the required fields, then post.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton active={movementForm.movementType === "INBOUND"} label="Add Inventory" onClick={() => openInventoryAction("INBOUND")} />
              <ActionButton active={movementForm.movementType === "ADJUSTMENT"} label="Adjust Quantity" onClick={() => openInventoryAction("ADJUSTMENT")} />
              <ActionButton
                active={movementForm.movementType === "TRANSFER" && transferMode === "WAREHOUSE"}
                label="Warehouse Transfer"
                onClick={() => {
                  setTransferMode("WAREHOUSE");
                  openInventoryAction("TRANSFER");
                }}
              />
              <ActionButton
                active={movementForm.movementType === "TRANSFER" && transferMode === "PALLET"}
                label="Pallet Transfer"
                onClick={() => {
                  setTransferMode("PALLET");
                  openInventoryAction("TRANSFER", {
                    toWarehouseId: movementForm.fromWarehouseId || movementForm.warehouseId || movementForm.toWarehouseId,
                  });
                }}
              />
              <ActionButton active={movementForm.movementType === "OUTBOUND"} label="Ship Out" onClick={() => openInventoryAction("OUTBOUND")} />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <div className="space-y-4">
                {movementForm.movementType === "OUTBOUND" ? (
                  <label className="space-y-1">
                    <span className="text-sm font-medium">Sales Order</span>
                    <select
                      className="w-full rounded-md border border-neutral-300 px-3 py-2"
                      onChange={(event) =>
                        setMovementForm((current) => ({
                          ...current,
                          referenceType: "SALES_ORDER",
                          referenceId: event.target.value,
                          skuId: "",
                          palletLocationId: "",
                        }))
                      }
                      value={movementForm.referenceId}
                    >
                      <option value="">Select confirmed order</option>
                      {confirmedOrdersQuery.data?.items.map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.soNumber} · {order.customerCompanyName}
                        </option>
                      ))}
                    </select>
                    {!confirmedOrdersQuery.data?.items.length ? (
                      <span className="text-xs text-amber-700">No confirmed sales orders are ready to ship.</span>
                    ) : null}
                  </label>
                ) : null}
                <label className="space-y-1">
                  <span className="text-sm font-medium">{movementForm.movementType === "OUTBOUND" ? "Order SKU Line" : "SKU"}</span>
                  <select
                    className="w-full rounded-md border border-neutral-300 px-3 py-2"
                    disabled={movementForm.movementType === "OUTBOUND" && !movementForm.referenceId}
                    onChange={(event) => {
                      const reservation = selectedShipOrderReservations.find((item: Reservation) => item.skuId === event.target.value);
                      setMovementForm((current) => ({
                        ...current,
                        skuId: event.target.value,
                        quantity: reservation ? String(reservation.quantityReserved) : current.quantity,
                        palletLocationId: "",
                      }));
                    }}
                    value={movementForm.skuId}
                  >
                    <option value="">
                      {movementForm.movementType === "OUTBOUND" ? "Select order SKU" : "Select SKU"}
                    </option>
                    {movementForm.movementType === "OUTBOUND"
                      ? selectedShipOrderReservations.map((reservation: Reservation) => (
                          <option key={reservation.id} value={reservation.skuId}>
                            {reservation.skuCode} · {reservation.productName} · reserved {reservation.quantityReserved}
                          </option>
                        ))
                      : skuOptions.map((sku) => (
                          <option key={sku.id} value={sku.id}>
                            {sku.skuCode} · {sku.productName}
                          </option>
                        ))}
                  </select>
                  {movementForm.movementType === "OUTBOUND" && selectedShipOrder && !selectedShipOrderReservations.length ? (
                    <span className="text-xs text-amber-700">This confirmed order has no active reservation to ship.</span>
                  ) : null}
                </label>
                {movementForm.movementType === "OUTBOUND" && selectedShipReservation ? (
                  <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    Reserved for this order: <span className="font-semibold">{selectedShipReservation.quantityReserved}</span>
                    {selectedShipLine ? ` · Ordered ${selectedShipLine.quantityOrdered}` : ""}
                  </div>
                ) : null}
                <label className="space-y-1">
                  <span className="text-sm font-medium">
                    {movementForm.movementType === "ADJUSTMENT" ? "Adjustment Quantity" : "Quantity"}
                  </span>
                  <input
                    className="w-full rounded-md border border-neutral-300 px-3 py-2"
                    onChange={(event) => setMovementForm((current) => ({ ...current, quantity: event.target.value }))}
                    type="number"
                    value={movementForm.quantity}
                  />
                </label>
                <InputField label="Reason" onChange={(value) => setMovementForm((current) => ({ ...current, reason: value }))} value={movementForm.reason} />
                <label className="space-y-1">
                  <span className="text-sm font-medium">Notes</span>
                  <textarea
                    className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2"
                    onChange={(event) => setMovementForm((current) => ({ ...current, notes: event.target.value }))}
                    value={movementForm.notes}
                  />
                </label>
              </div>

              <div className="space-y-4">
                {movementForm.movementType === "TRANSFER" ? (
                  <>
                    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700">
                      {transferMode === "WAREHOUSE" ? "CA / Texas warehouse transfer" : "Warehouse pallet location transfer"}
                    </div>
                  <label className="space-y-1">
                    <span className="text-sm font-medium">From Warehouse</span>
                    <select
                      className="w-full rounded-md border border-neutral-300 px-3 py-2"
                      onChange={(event) =>
                        setMovementForm((current) => ({
                          ...current,
                          fromWarehouseId: event.target.value,
                          fromWarehouseLocation: warehouseNameById(event.target.value),
                          toWarehouseId: transferMode === "PALLET" ? event.target.value : current.toWarehouseId,
                          toWarehouseLocation: transferMode === "PALLET" ? warehouseNameById(event.target.value) : current.toWarehouseLocation,
                          fromPalletLocationId: "",
                          fromPalletLocation: "",
                        }))
                      }
                      value={movementForm.fromWarehouseId}
                    >
                      <option value="">Select source warehouse</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium">To Warehouse</span>
                    <select
                      className="w-full rounded-md border border-neutral-300 px-3 py-2"
                      onChange={(event) =>
                        setMovementForm((current) => ({
                          ...current,
                          toWarehouseId: event.target.value,
                          toWarehouseLocation: warehouseNameById(event.target.value),
                          toPalletLocationId: "",
                          toPalletLocation: "",
                        }))
                      }
                      value={movementForm.toWarehouseId}
                      disabled={transferMode === "PALLET"}
                    >
                      <option value="">Select destination warehouse</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  </>
                ) : (
                  <label className="space-y-1">
                    <span className="text-sm font-medium">Warehouse</span>
                    <select
                      className="w-full rounded-md border border-neutral-300 px-3 py-2"
                      onChange={(event) =>
                        setMovementForm((current) => ({
                          ...current,
                          warehouseId: event.target.value,
                          palletLocationId: "",
                        }))
                      }
                      value={movementForm.warehouseId}
                    >
                      <option value="">Select warehouse</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {movementForm.movementType === "TRANSFER" && transferMode === "PALLET" && movementFromWarehouse?.isPalletTracked ? (
                  <label className="space-y-1">
                    <span className="text-sm font-medium">From Pallet Location</span>
                    <select
                      className="w-full rounded-md border border-neutral-300 px-3 py-2"
                      onChange={(event) =>
                        setMovementForm((current) => ({
                          ...current,
                          fromPalletLocationId: event.target.value,
                          fromPalletLocation: palletLabelById(event.target.value),
                        }))
                      }
                      value={movementForm.fromPalletLocationId}
                    >
                      <option value="">Select source pallet</option>
                      {movementFromPallets.map((pallet) => (
                        <option key={pallet.id} value={pallet.id}>
                          {pallet.code} · {pallet.zone ?? "La Mirada"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {movementForm.movementType === "TRANSFER" && transferMode === "PALLET" && movementToWarehouse?.isPalletTracked ? (
                  <label className="space-y-1">
                    <span className="text-sm font-medium">To Pallet Location</span>
                    <select
                      className="w-full rounded-md border border-neutral-300 px-3 py-2"
                      onChange={(event) =>
                        setMovementForm((current) => ({
                          ...current,
                          toPalletLocationId: event.target.value,
                          toPalletLocation: palletLabelById(event.target.value),
                        }))
                      }
                      value={movementForm.toPalletLocationId}
                    >
                      <option value="">Select destination pallet</option>
                      {movementToPallets.map((pallet: PalletLocation) => (
                        <option key={pallet.id} value={pallet.id}>
                          {pallet.code} · {pallet.zone ?? "La Mirada"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

            {movementForm.movementType !== "TRANSFER" && movementWarehouse?.isPalletTracked ? (
              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  {movementForm.movementType === "OUTBOUND" ? "Pick From Pallet" : "Pallet Location"}
                </span>
                <select
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                  disabled={movementForm.movementType === "OUTBOUND" && (!movementForm.referenceId || !movementForm.skuId)}
                  onChange={(event) =>
                    setMovementForm((current) => ({ ...current, palletLocationId: event.target.value }))
                  }
                  value={movementForm.palletLocationId}
                >
                  <option value="">
                    {movementForm.movementType === "OUTBOUND" ? "Select source pallet" : "Select pallet"}
                  </option>
                  {movementForm.movementType === "OUTBOUND"
                    ? pickablePalletBalances.map((balance: SkuLocationBalance) => (
                        <option key={balance.id} value={balance.palletLocationId ?? ""}>
                          {balance.palletCode} · available {balance.available}
                        </option>
                      ))
                    : movementWarehousePallets.map((pallet: PalletLocation) => (
                        <option key={pallet.id} value={pallet.id}>
                          {pallet.code} · {pallet.zone ?? "La Mirada"}
                        </option>
                      ))}
                </select>
                {movementForm.movementType === "OUTBOUND" && movementForm.skuId && !pickablePalletBalances.length ? (
                  <span className="text-xs text-amber-700">No pallet currently has available stock for this SKU in this warehouse.</span>
                ) : null}
              </label>
            ) : null}

            {movementForm.movementType === "OUTBOUND" && movementWarehouse && !movementWarehouse.isPalletTracked ? (
              <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
                Warehouse-level ship out. Available here: {warehouseLevelActionBalance?.available ?? 0}
              </div>
            ) : null}
              </div>
            </div>
            <button
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={createMovementMutation.isPending}
              type="submit"
            >
              {createMovementMutation.isPending ? "Posting..." : "Start Stock Movement"}
            </button>
          </form>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
              <h3 className="text-lg font-semibold">Inventory Action</h3>
              <p className="mt-2 text-sm text-neutral-500">
                Only Admin and Warehouse users can post inbound, outbound, adjustment, or transfer movements. You can still review the activity log.
              </p>
            </div>
          )}

        </div>
      ) : null}

      {isActivityMode ? (
        <MovementsLedgerCard
          allPalletLocations={allPalletLocations}
          dateFromFilter={movementDateFromFilter}
          dateToFilter={movementDateToFilter}
          movementSearch={movementSearch}
          movementPage={movementPage}
          movementTypeFilter={movementTypeFilter}
          palletFilter={movementPalletFilter}
          movements={movementsQuery.data?.items ?? []}
          setDateFromFilter={setMovementDateFromFilter}
          setDateToFilter={setMovementDateToFilter}
          setMovementSearch={setMovementSearch}
          setMovementPage={setMovementPage}
          setMovementTypeFilter={setMovementTypeFilter}
          setPalletFilter={setMovementPalletFilter}
          setUserFilter={setMovementUserFilter}
          setWarehouseFilter={setMovementWarehouseFilter}
          totalMovementPages={totalMovementPages}
          totalMovements={movementsQuery.data?.pagination.total ?? 0}
          userFilter={movementUserFilter}
          warehouseFilter={movementWarehouseFilter}
          warehouses={warehouses}
        />
      ) : null}

      {isPalletsMode ? (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.15fr]">
          <div className="space-y-6">
            <div className="rounded-xl border border-neutral-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">By Pallet</h3>
                  <p className="mt-2 text-sm text-neutral-500">
                    Choose a warehouse, then inspect what SKU and stock currently sit on each pallet location.
                  </p>
                </div>
                <div className="flex min-w-[220px] flex-col gap-3">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Warehouse</span>
                    <select
                      className="w-full rounded-md border border-neutral-300 px-3 py-2"
                      onChange={(event) => setSelectedWarehouseId(event.target.value)}
                      value={selectedWarehouseId}
                    >
                      <option value="">Select warehouse</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {canCreateMovements && selectedWarehouse?.isPalletTracked ? (
                    <button
                      className="rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                      onClick={openNewPalletModal}
                      type="button"
                    >
                      Add Pallet Location
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                {selectedWarehouse?.isPalletTracked
                  ? "This warehouse tracks pallet locations. Pick a pallet below to review its live contents."
                  : "This warehouse is warehouse-level only for now, so pallet detail is intentionally hidden."}
              </div>
              {selectedWarehouse?.isPalletTracked ? (
                <div className="mt-4 space-y-3">
                  {palletLocations.map((pallet) => (
                    <div
                      key={pallet.id}
                      className={[
                        "rounded-xl border px-4 py-3 transition-colors",
                        selectedPalletId === pallet.id
                          ? "border-green-200 bg-green-50 text-green-900"
                          : "border-neutral-200 bg-white hover:bg-neutral-50",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <button className="flex-1 text-left" onClick={() => setSelectedPalletId(pallet.id)} type="button">
                          <p className="font-medium">{pallet.code}</p>
                          <p className="mt-1 text-sm text-neutral-500">
                            {pallet.zone ?? pallet.label}
                            {pallet.isActive ? "" : " · Inactive"}
                          </p>
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-xs uppercase tracking-[0.16em] text-neutral-400">Open</span>
                          {canCreateMovements ? (
                            <button
                              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                              onClick={() => openEditPalletModal(pallet)}
                              type="button"
                            >
                              Edit
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                  {!palletLocations.length ? (
                    <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500">
                      No pallet locations are configured yet for this warehouse.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-neutral-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">By SKU</h3>
                  <p className="mt-2 text-sm text-neutral-500">
                    Use the currently selected product to review how its stock is distributed by warehouse and pallet.
                  </p>
                </div>
                <Link
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  to="/inventory/stock-overview"
                >
                  Open Stock Overview
                </Link>
              </div>
              <div className="mt-4 rounded-xl border border-neutral-200 bg-white">
                <div className="divide-y divide-neutral-200">
                  {skuLocationBalancesQuery.data?.items.map((balance) => (
                    <div key={balance.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.3fr_repeat(3,minmax(0,1fr))] md:items-center">
                      <div>
                        <p className="font-medium text-neutral-800">{balance.warehouseName}</p>
                        <p className="mt-1 text-sm text-neutral-500">
                          {balance.palletCode ? `Pallet ${balance.palletCode}` : "Warehouse-only stock"}
                        </p>
                      </div>
                      <MiniMetric label="QOH" value={String(balance.quantityOnHand)} />
                      <MiniMetric label="Reserved" value={String(balance.quantityReserved)} />
                      <MiniMetric label="Available" value={String(balance.available)} />
                    </div>
                  ))}
                  {!skuLocationBalancesQuery.data?.items.length ? (
                    <div className="px-5 py-6 text-sm text-neutral-500">
                      Select a SKU in Stock Overview to review location balances here.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-neutral-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Pallet Stock</h3>
                  <p className="mt-2 text-sm text-neutral-500">
                    Review the live content of the selected pallet location.
                  </p>
                </div>
                {palletStockQuery.data?.palletLocation ? (
                  <div className="text-right">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                      {palletStockQuery.data.palletLocation.code}
                    </span>
                    <p className="mt-2 text-xs text-neutral-500">
                      {palletStockQuery.data.palletLocation.isActive ? "Active" : "Inactive"}
                      {palletStockQuery.data.palletLocation.zone ? ` · ${palletStockQuery.data.palletLocation.zone}` : ""}
                    </p>
                  </div>
                ) : null}
              </div>
              {palletStockQuery.data?.palletLocation ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className="rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                    onClick={() =>
                      openInventoryAction("INBOUND", {
                        warehouseId: palletStockQuery.data.palletLocation.warehouseId,
                        palletLocationId: palletStockQuery.data.palletLocation.id,
                      })
                    }
                    type="button"
                  >
                    Add SKU to Pallet
                  </button>
                  <button
                    className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                    onClick={() =>
                      openInventoryAction("ADJUSTMENT", {
                        warehouseId: palletStockQuery.data.palletLocation.warehouseId,
                        palletLocationId: palletStockQuery.data.palletLocation.id,
                      })
                    }
                    type="button"
                  >
                    Adjust Count
                  </button>
                  <button
                    className="rounded-md border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100"
                    onClick={() =>
                      openInventoryAction("TRANSFER", {
                        fromWarehouseId: palletStockQuery.data.palletLocation.warehouseId,
                        fromPalletLocationId: palletStockQuery.data.palletLocation.id,
                      })
                    }
                    type="button"
                  >
                    Move Stock Out
                  </button>
                </div>
              ) : null}
              <div className="mt-4 rounded-xl border border-neutral-200 bg-white">
                <div className="divide-y divide-neutral-200">
                  {palletStockQuery.data?.items.map((item) => (
                    <div key={item.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.5fr_repeat(3,minmax(0,1fr))] md:items-center">
                      <div>
                        <p className="font-medium text-neutral-800">
                          {item.skuCode} · {item.productName}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">
                          {item.category} · {item.unit}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-wide text-neutral-400">
                          Last updated {new Date(item.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <MiniMetric label="QOH" value={String(item.quantityOnHand)} />
                      <MiniMetric label="Reserved" value={String(item.quantityReserved)} />
                      <MiniMetric label="Available" value={String(item.available)} />
                    </div>
                  ))}
                  {!palletStockQuery.data?.items.length ? (
                    <div className="px-5 py-6 text-sm text-neutral-500">
                      {selectedPalletId
                        ? "No stock is currently assigned to this pallet."
                        : "Choose a pallet location on the left to inspect its contents."}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

        {isLowStockMode ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-neutral-200">
            <div className="border-b border-neutral-200 px-5 py-4">
              <h3 className="text-lg font-semibold">Low Stock Watchlist</h3>
              <p className="text-sm text-neutral-500">Prioritize items whose available stock is approaching or below their reorder point.</p>
            </div>
            <div className="divide-y divide-neutral-200">
              {lowStockQuery.data?.items.map((sku) => (
                <div key={sku.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {sku.skuCode} · {sku.productName}
                      </p>
                      <p className="mt-1 text-sm text-neutral-500">
                        Available {sku.available} · QOH {sku.quantityOnHand} · Reserved {sku.quantityReserved}
                      </p>
                      <p className="mt-1 text-sm text-neutral-500">
                        Reorder at {sku.reorderLevel} · Suggested order {sku.reorderQuantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                        Reorder
                      </span>
                      <div className="mt-3">
                        <Link
                          className="text-sm font-medium text-green-700 hover:text-green-800"
                          to="/inventory/stock-overview"
                        >
                          Open Stock Overview
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!lowStockQuery.data?.items.length ? (
                <div className="px-5 py-6 text-sm text-neutral-500">No low stock items right now.</div>
              ) : null}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <h3 className="text-lg font-semibold">Recommended Flow</h3>
              <div className="mt-4 space-y-4 text-sm text-neutral-600">
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                  <p className="font-medium text-neutral-800">1. Triage shortages</p>
                  <p className="mt-1">Use this page to decide which items need immediate replenishment attention.</p>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                  <p className="font-medium text-neutral-800">2. Inspect the product</p>
                  <p className="mt-1">Jump into Stock Overview to review stock history, reservation pressure, and item details.</p>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                  <p className="font-medium text-neutral-800">3. Post an inventory action</p>
                  <p className="mt-1">Use Inventory Actions to receive stock or process outbound corrections.</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <h3 className="text-lg font-semibold">Recent Activity Snapshot</h3>
              <div className="mt-4 space-y-3">
                {movementsQuery.data?.items.slice(0, 5).map((movement) => (
                  <div key={movement.id} className="rounded-lg border border-neutral-200 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {movement.skuCode} · {movement.productName}
                        </p>
                        <p className="text-sm text-neutral-500">{movement.reason ?? "No reason"}</p>
                      </div>
                      <StatusBadge>{movement.movementType}</StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isProductsMode && canEditProducts && isCreateProductOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-900/45 px-4 py-8">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Add SKU</p>
                <h3 className="mt-2 text-2xl font-semibold">New SKU</h3>
                <p className="mt-2 text-sm text-neutral-500">
                  Add a stock item before you start moving or reserving it.
                </p>
              </div>
              <button
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                onClick={() => setIsCreateProductOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleCreateSku}>
              <div className="grid gap-4 md:grid-cols-2">
                <InputField label="SKU Code" onChange={(value) => setSkuForm((current) => ({ ...current, skuCode: value }))} value={skuForm.skuCode} />
                <InputField label="Product Name" onChange={(value) => setSkuForm((current) => ({ ...current, productName: value }))} value={skuForm.productName} />
                <InputField label="Category" onChange={(value) => setSkuForm((current) => ({ ...current, category: value }))} value={skuForm.category} />
                <InputField label="Location" onChange={(value) => setSkuForm((current) => ({ ...current, warehouseLocation: value }))} value={skuForm.warehouseLocation} />
                <InputField label="Unit Cost" onChange={(value) => setSkuForm((current) => ({ ...current, unitCost: value }))} type="number" value={skuForm.unitCost} />
                <InputField label="Selling Price" onChange={(value) => setSkuForm((current) => ({ ...current, sellingPrice: value }))} type="number" value={skuForm.sellingPrice} />
                <InputField label="Reorder Level" onChange={(value) => setSkuForm((current) => ({ ...current, reorderLevel: value }))} type="number" value={skuForm.reorderLevel} />
                <InputField label="Reorder Quantity" onChange={(value) => setSkuForm((current) => ({ ...current, reorderQuantity: value }))} type="number" value={skuForm.reorderQuantity} />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  onClick={() => setIsCreateProductOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  disabled={createSkuMutation.isPending}
                  type="submit"
                >
                  {createSkuMutation.isPending ? "Creating..." : "Add SKU"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isPalletsMode && isPalletModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-900/45 px-4 py-8">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Pallet Locations</p>
                <h3 className="mt-2 text-2xl font-semibold">
                  {editingPalletId ? "Edit Pallet Location" : "Add Pallet Location"}
                </h3>
                <p className="mt-2 text-sm text-neutral-500">
                  Maintain La Mirada pallet positions so warehouse staff can inspect and move stock at the pallet level.
                </p>
                <p className="mt-2 text-xs text-neutral-400">
                  Deactivation is blocked while stock is still assigned. Deletion is blocked once a pallet has balance history or movement history.
                </p>
              </div>
              <button
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                onClick={() => {
                  setIsPalletModalOpen(false);
                  setEditingPalletId("");
                }}
                type="button"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSavePalletLocation}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium">Warehouse</span>
                  <select
                    className="w-full rounded-md border border-neutral-300 px-3 py-2"
                    onChange={(event) => setPalletForm((current) => ({ ...current, warehouseId: event.target.value }))}
                    value={palletForm.warehouseId}
                  >
                    <option value="">Select warehouse</option>
                    {warehouses.filter((warehouse) => warehouse.isPalletTracked).map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </label>
                <InputField
                  label="Pallet Code"
                  onChange={(value) => setPalletForm((current) => ({ ...current, code: value.toUpperCase() }))}
                  value={palletForm.code}
                />
                <InputField
                  label="Label"
                  onChange={(value) => setPalletForm((current) => ({ ...current, label: value }))}
                  value={palletForm.label}
                />
                <InputField
                  label="Zone"
                  onChange={(value) => setPalletForm((current) => ({ ...current, zone: value }))}
                  value={palletForm.zone}
                />
              </div>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Notes</span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2"
                  onChange={(event) => setPalletForm((current) => ({ ...current, notes: event.target.value }))}
                  value={palletForm.notes}
                />
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                <input
                  checked={palletForm.isActive}
                  className="h-4 w-4 rounded border-neutral-300"
                  onChange={(event) => setPalletForm((current) => ({ ...current, isActive: event.target.checked }))}
                  type="checkbox"
                />
                Active pallet location
              </label>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  onClick={() => {
                    setIsPalletModalOpen(false);
                    setEditingPalletId("");
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  disabled={createPalletMutation.isPending || updatePalletMutation.isPending || deletePalletMutation.isPending}
                  type="submit"
                >
                  {createPalletMutation.isPending || updatePalletMutation.isPending
                    ? "Saving..."
                    : editingPalletId
                      ? "Save Pallet Location"
                      : "Add Pallet Location"}
                </button>
                {editingPalletId ? (
                  <button
                    className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                    disabled={createPalletMutation.isPending || updatePalletMutation.isPending || deletePalletMutation.isPending}
                    onClick={() => {
                      const confirmed = window.confirm("Delete this pallet location? This will be blocked if it already has stock or history.");
                      if (!confirmed) {
                        return;
                      }
                      deletePalletMutation.mutate(editingPalletId);
                    }}
                    type="button"
                  >
                    {deletePalletMutation.isPending ? "Deleting..." : "Delete"}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isProductsMode && isProductSearchOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-900/45 px-4 py-8">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Stock Search</p>
                <h3 className="mt-2 text-2xl font-semibold">Find a SKU</h3>
                <p className="mt-2 text-sm text-neutral-500">
                  Search by SKU, product name, category, or stock status, then open the record you want to review.
                </p>
              </div>
              <button
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                onClick={() => setIsProductSearchOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="mt-6">
              <ProductsQueueCard
                navigate={navigate}
                page={skuPage}
                selectedSkuId={selectedSkuId}
                setPage={setSkuPage}
                setSearch={setSkuSearch}
                setSelectedSkuId={setSelectedSkuId}
                skuSearch={skuSearch}
                skus={skusQuery.data?.items ?? []}
                totalPages={totalSkuPages}
                totalSkus={skusQuery.data?.pagination.total ?? 0}
                onSelectSku={() => setIsProductSearchOpen(false)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ActionButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={[
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-green-600 bg-green-600 text-white"
          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function WorkflowNavLink({ active, label, to }: { active: boolean; label: string; to: string }) {
  return (
    <Link
      className={[
        "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-neutral-300 text-neutral-700 hover:bg-neutral-50",
      ].join(" ")}
      to={to}
    >
      {label}
    </Link>
  );
}

function ProductsQueueCard({
  navigate,
  page,
  selectedSkuId,
  setPage,
  setSearch,
  setSelectedSkuId,
  skuSearch,
  skus,
  totalPages,
  totalSkus,
  onSelectSku,
}: {
  navigate: ReturnType<typeof useNavigate>;
  page: number;
  selectedSkuId: string;
  setPage: (value: number | ((current: number) => number)) => void;
  setSearch: (value: string) => void;
  setSelectedSkuId: (value: string) => void;
  skuSearch: string;
  skus: Sku[];
  totalPages: number;
  totalSkus: number;
  onSelectSku?: () => void;
}) {
  const hasSearchQueue = skuSearch.trim().length > 0;

  return (
    <div className="rounded-xl border border-neutral-200">
      <div className="border-b border-neutral-200 px-5 py-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Stock Search</h3>
            <p className="text-sm text-neutral-500">Type a SKU or product name. Results appear only after searching.</p>
          </div>
          <div>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Search</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="SKU or product"
                value={skuSearch}
              />
            </label>
          </div>
        </div>
      </div>
      {hasSearchQueue ? (
        <div className="divide-y divide-neutral-200 border-t border-neutral-200">
          {skus.map((sku) => (
          <div
            key={sku.id}
            className={[
              "w-full cursor-pointer px-5 py-4 text-left transition-all hover:bg-neutral-50 hover:shadow-sm",
              selectedSkuId === sku.id
                ? "bg-[linear-gradient(135deg,#f3faf3_0%,#e8f4e8_100%)] ring-1 ring-inset ring-green-200"
                : "bg-white",
            ].join(" ")}
            onClick={() => {
              setSelectedSkuId(sku.id);
              setSearch("");
              navigate(`/inventory/stock-overview/${sku.id}`);
              onSelectSku?.();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedSkuId(sku.id);
                setSearch("");
                navigate(`/inventory/stock-overview/${sku.id}`);
                onSelectSku?.();
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{sku.skuCode}</p>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                    {sku.category}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-500">{sku.productName}</p>
              </div>
              <StatusBadge>{sku.status}</StatusBadge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm text-neutral-600">
              <div className="rounded-lg bg-white/80 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-neutral-400">QOH</p>
                <p className="mt-1 font-medium">{sku.quantityOnHand}</p>
              </div>
              <div className="rounded-lg bg-white/80 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-neutral-400">Reserved</p>
                <p className="mt-1 font-medium">{sku.quantityReserved}</p>
              </div>
              <div className="rounded-lg bg-white/80 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-neutral-400">Available</p>
                <p className={["mt-1 font-medium", sku.available <= sku.reorderLevel ? "text-amber-700" : "text-neutral-800"].join(" ")}>
                  {sku.available}
                </p>
              </div>
            </div>
          </div>
          ))}
          {!skus.length ? <div className="px-5 py-6 text-sm text-neutral-500">No SKUs match the current search.</div> : null}
        </div>
      ) : null}
      {hasSearchQueue && totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-4 text-sm">
          <p className="text-neutral-500">
            Page {page} of {totalPages} · {totalSkus} matches
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-neutral-300 px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="rounded-md border border-neutral-300 px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MovementsLedgerCard({
  allPalletLocations,
  dateFromFilter,
  dateToFilter,
  movementSearch,
  movementPage,
  movementTypeFilter,
  movements,
  palletFilter,
  setDateFromFilter,
  setDateToFilter,
  setMovementSearch,
  setMovementPage,
  setMovementTypeFilter,
  setPalletFilter,
  setUserFilter,
  setWarehouseFilter,
  totalMovementPages,
  totalMovements,
  userFilter,
  warehouseFilter,
  warehouses,
}: {
  allPalletLocations: PalletLocation[];
  dateFromFilter: string;
  dateToFilter: string;
  movementSearch: string;
  movementPage: number;
  movementTypeFilter: string;
  movements: InventoryMovement[];
  palletFilter: string;
  setDateFromFilter: (value: string) => void;
  setDateToFilter: (value: string) => void;
  setMovementSearch: (value: string) => void;
  setMovementPage: (value: number | ((current: number) => number)) => void;
  setMovementTypeFilter: (value: string) => void;
  setPalletFilter: (value: string) => void;
  setUserFilter: (value: string) => void;
  setWarehouseFilter: (value: string) => void;
  totalMovementPages: number;
  totalMovements: number;
  userFilter: string;
  warehouseFilter: string;
  warehouses: Warehouse[];
}) {
  const filteredPallets = warehouseFilter
    ? allPalletLocations.filter((pallet) => pallet.warehouseId === warehouseFilter)
    : allPalletLocations;

  return (
    <div className="rounded-xl border border-neutral-200">
      <div className="border-b border-neutral-200 px-5 py-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Activity Log</h3>
            <p className="text-sm text-neutral-500">
              Audit inbound, outbound, adjustment, and transfer records across SKU, warehouse, pallet, reference, user, and date.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Search</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setMovementSearch(event.target.value)}
                placeholder="SKU, product, or SO"
                value={movementSearch}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Movement Type</span>
              <select
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setMovementTypeFilter(event.target.value)}
                value={movementTypeFilter}
              >
                <option value="">All types</option>
                <option value="INBOUND">Inbound</option>
                <option value="OUTBOUND">Outbound</option>
                <option value="ADJUSTMENT">Adjustment</option>
                <option value="TRANSFER">Transfer WH Location</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Warehouse</span>
              <select
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => {
                  setWarehouseFilter(event.target.value);
                  setPalletFilter("");
                }}
                value={warehouseFilter}
              >
                <option value="">All warehouses</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Pallet</span>
              <select
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setPalletFilter(event.target.value)}
                value={palletFilter}
              >
                <option value="">All pallets</option>
                {filteredPallets.map((pallet) => (
                  <option key={pallet.id} value={pallet.id}>
                    {pallet.code} · {pallet.warehouseName ?? "Warehouse"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">User</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setUserFilter(event.target.value)}
                placeholder="Name or email"
                value={userFilter}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">From Date</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setDateFromFilter(event.target.value)}
                type="date"
                value={dateFromFilter}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">To Date</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setDateToFilter(event.target.value)}
                type="date"
                value={dateToFilter}
              />
            </label>
          </div>
        </div>
      </div>
      <div className="divide-y divide-neutral-200">
        {movements.map((movement) => (
          <div key={movement.id} className="px-5 py-4 text-sm transition-colors hover:bg-neutral-50">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {movement.skuCode} · {movement.productName}
                  </p>
                  {movement.referenceType ? (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                      {movement.referenceType}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-neutral-500">
                  {movement.reason ?? "No reason"} · {movement.createdByName}
                </p>
                {movement.movementType === "TRANSFER" ? (
                  <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900">
                    {(() => {
                      const transfer = parseTransferLocationNotes(movement.notes);
                      return transfer ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">From</p>
                            <p className="mt-1">
                              {transfer.fromWarehouseLocation || "Unknown warehouse"}
                              {transfer.fromPalletLocation ? ` · ${transfer.fromPalletLocation}` : ""}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">To</p>
                            <p className="mt-1">
                              {transfer.toWarehouseLocation || "Unknown warehouse"}
                              {transfer.toPalletLocation ? ` · ${transfer.toPalletLocation}` : ""}
                            </p>
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link
                    className="text-xs font-semibold uppercase tracking-wide text-green-700 hover:text-green-800"
                    to={`/inventory/stock-overview/${movement.skuId}`}
                  >
                    Open SKU
                  </Link>
                  {movement.referenceType === "SALES_ORDER" && movement.referenceId ? (
                    <Link
                      className="text-xs font-semibold uppercase tracking-wide text-blue-700 hover:text-blue-800"
                      to={`/sales/orders?selected=${movement.referenceId}`}
                    >
                      Open Sales Order
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="min-w-[120px] rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-right">
                <StatusBadge>{movement.movementType}</StatusBadge>
                <p className="mt-2 font-semibold">{movement.quantity}</p>
                <p className="mt-2 text-[11px] uppercase tracking-wide text-neutral-400">
                  {new Date(movement.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        ))}
        {!movements.length ? <div className="px-5 py-6 text-sm text-neutral-500">No movements match the current filters.</div> : null}
      </div>
      <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-4 text-sm">
        <p className="text-neutral-500">
          Page {movementPage} of {totalMovementPages} · {totalMovements} movements
        </p>
        <div className="flex gap-2">
          <button
            className="rounded-md border border-neutral-300 px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            disabled={movementPage <= 1}
            onClick={() => setMovementPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            Previous
          </button>
          <button
            className="rounded-md border border-neutral-300 px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            disabled={movementPage >= totalMovementPages}
            onClick={() => setMovementPage((current) => Math.min(totalMovementPages, current + 1))}
            type="button"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-neutral-800">{value}</p>
    </div>
  );
}

function InlineStockStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="ml-2 font-semibold text-neutral-900">{value}</span>
    </div>
  );
}

function RecordField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-neutral-800">{value}</p>
    </div>
  );
}

function formatActivityChanges(changes?: Record<string, unknown>) {
  if (!changes) {
    return "No additional change summary was recorded.";
  }

  const keys = Object.keys(changes).slice(0, 3);
  if (!keys.length) {
    return "No additional change summary was recorded.";
  }

  return keys
    .map((key) => `${key}: ${String(changes[key])}`)
    .join(" · ");
}

function parseTransferLocationNotes(notes?: string) {
  if (!notes) {
    return null;
  }

  const lines = notes.split("\n").map((line) => line.trim());
  const fromWarehouseLocation = lines.find((line) => line.startsWith("From WH Location:"))?.split(":").slice(1).join(":").trim();
  const toWarehouseLocation = lines.find((line) => line.startsWith("To WH Location:"))?.split(":").slice(1).join(":").trim();
  const fromPalletLocation = lines.find((line) => line.startsWith("From Pallet Location:"))?.split(":").slice(1).join(":").trim();
  const toPalletLocation = lines.find((line) => line.startsWith("To Pallet Location:"))?.split(":").slice(1).join(":").trim();

  if (!fromWarehouseLocation && !toWarehouseLocation && !fromPalletLocation && !toPalletLocation) {
    return null;
  }

  return {
    fromWarehouseLocation,
    toWarehouseLocation,
    fromPalletLocation,
    toPalletLocation,
  };
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="w-full rounded-md border border-neutral-300 px-3 py-2"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}
