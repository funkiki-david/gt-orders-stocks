import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import type {
  ActivityEntry,
  Customer,
  PalletLocation,
  SalesOrderDetail,
  SalesOrderSummary,
  Sku,
  Warehouse,
} from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import {
  canCreateSalesOrders,
  canManageSalesOrders,
  canPostInventoryMovements,
  canViewCustomers,
  getCurrentRole,
} from "@/lib/permissions";
import { AccessDeniedPanel } from "@/components/AccessDeniedPanel";

type PagedResponse<T> = {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

type DraftOrderLine = {
  skuId: string;
  productDescription: string;
  quantityOrdered: string;
  unitPrice: string;
};

type OrderFormState = {
  soNumber: string;
  customerId: string;
  subtotalAmount: string;
  shippingCharge: string;
  notes: string;
  lines: DraftOrderLine[];
};

type FulfillmentLineState = {
  quantity: string;
  warehouseId: string;
  palletLocationId: string;
};

type OrdersPageProps = {
  mode?: "workspace" | "new";
};

function createEmptyLine(defaultSku?: Sku): DraftOrderLine {
  return {
    skuId: defaultSku?.id ?? "",
    productDescription: defaultSku?.productName ?? "",
    quantityOrdered: "1",
    unitPrice: defaultSku?.sellingPrice ?? "0.00",
  };
}

function calculateDraftLineSubtotal(lines: DraftOrderLine[]) {
  return lines.reduce((sum, line) => {
    const quantity = Number(line.quantityOrdered) || 0;
    const unitPrice = Number(line.unitPrice) || 0;
    return sum + quantity * unitPrice;
  }, 0);
}

function calculateDraftTotal(form: OrderFormState) {
  return Number(form.subtotalAmount || calculateDraftLineSubtotal(form.lines)) + (Number(form.shippingCharge) || 0);
}

function toDraftEditorState(order: SalesOrderDetail): OrderFormState {
  return {
    soNumber: order.soNumber,
    customerId: order.customerId,
    subtotalAmount: String(order.subtotalAmount ?? order.totalAmount),
    shippingCharge: String(order.shippingCharge ?? "0.00"),
    notes: order.notes ?? "",
    lines: order.lines.map((line) => ({
      skuId: line.skuId,
      productDescription: line.productDescription ?? line.productName ?? "",
      quantityOrdered: String(line.quantityOrdered),
      unitPrice: String(line.unitPrice),
    })),
  };
}

function buildOrdersUrl(input: {
  page: number;
  pageSize: number;
  search: string;
  statusFilter: string;
  customerFilter: string;
  skuFilter: string;
  dateFromFilter: string;
  dateToFilter: string;
  sortBy: string;
  sortDirection: string;
}) {
  return `/sales/orders?page=${input.page}&pageSize=${input.pageSize}&search=${encodeURIComponent(input.search)}${
    input.statusFilter ? `&status=${input.statusFilter}` : ""
  }${input.customerFilter ? `&customerId=${input.customerFilter}` : ""}${
    input.skuFilter ? `&skuId=${input.skuFilter}` : ""
  }${
    input.dateFromFilter ? `&dateFrom=${input.dateFromFilter}` : ""
  }${input.dateToFilter ? `&dateTo=${input.dateToFilter}` : ""}&sortBy=${input.sortBy}&sortDirection=${input.sortDirection}`;
}

function getOrderStatusSteps(status: SalesOrderSummary["status"]) {
  const steps = [
    { key: "DRAFT", label: "Draft", complete: true, current: status === "DRAFT" },
    {
      key: "CONFIRMED",
      label: "Confirmed",
      complete: status === "CONFIRMED" || status === "SHIPPED" || status === "COMPLETED",
      current: status === "CONFIRMED",
    },
    {
      key: "SHIPPED",
      label: "Shipped",
      complete: status === "SHIPPED" || status === "COMPLETED",
      current: status === "SHIPPED",
    },
  ];

  if (status === "CANCELLED") {
    return [
      { key: "DRAFT", label: "Draft", complete: true, current: false },
      { key: "CANCELLED", label: "Cancelled", complete: true, current: true },
    ];
  }

  return steps;
}

function isImportedHistoricalOrder(order?: Pick<SalesOrderSummary, "notes" | "soNumber"> | null) {
  if (!order) {
    return false;
  }

  return order.soNumber.startsWith("IMP-") || (order.notes ?? "").includes("Imported from Sales Orders reference sheet.");
}

export function OrdersPage({ mode = "workspace" }: OrdersPageProps) {
  const role = getCurrentRole();
  const canManageOrders = canManageSalesOrders(role);
  const canCreateOrders = canCreateSalesOrders(role);
  const canFulfillOrders = canPostInventoryMovements(role);
  const canAccessCustomers = canViewCustomers(role);
  const queryClient = useQueryClient();
  const autoSaveTriggeredRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedOrderParam = searchParams.get("selected") ?? "";
  const customerParam = searchParams.get("customer") ?? "";
  const skuParam = searchParams.get("sku") ?? "";
  const skuLabelParam = searchParams.get("skuLabel") ?? "";
  const sourceParam = searchParams.get("from") ?? "";
  const isNewMode = mode === "new";
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortDirection, setSortDirection] = useState("desc");
  const [error, setError] = useState("");
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState("");
  const [draftEditor, setDraftEditor] = useState<OrderFormState | null>(null);
  const [fulfillmentForm, setFulfillmentForm] = useState<Record<string, FulfillmentLineState>>({});
  const [form, setForm] = useState<OrderFormState>({
    soNumber: "",
    customerId: "",
    subtotalAmount: "",
    shippingCharge: "0.00",
    notes: "",
    lines: [createEmptyLine()],
  });

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiFetch<PagedResponse<Customer>>("/customers?page=1&pageSize=100"),
    enabled: canAccessCustomers,
  });

  const skusQuery = useQuery({
    queryKey: ["skus", "orders-page"],
    queryFn: () => apiFetch<PagedResponse<Sku>>("/inventory/skus?page=1&pageSize=100&status=ACTIVE"),
  });

  const warehousesQuery = useQuery({
    queryKey: ["inventory-warehouses", "orders-page"],
    queryFn: () => apiFetch<{ items: Warehouse[] }>("/inventory/warehouses"),
    enabled: canFulfillOrders,
  });

  const palletLocationsQuery = useQuery({
    queryKey: ["inventory-pallet-locations", "orders-page"],
    queryFn: () => apiFetch<{ items: PalletLocation[] }>("/inventory/pallet-locations"),
    enabled: canFulfillOrders,
  });

  const ordersQuery = useQuery({
    queryKey: [
      "orders",
      search,
      statusFilter,
      customerFilter,
      skuFilter,
      dateFromFilter,
      dateToFilter,
      page,
      pageSize,
      sortBy,
      sortDirection,
    ],
    queryFn: () =>
      apiFetch<PagedResponse<SalesOrderSummary>>(
        buildOrdersUrl({
          page,
          pageSize,
          search,
          statusFilter,
          customerFilter,
          skuFilter,
          dateFromFilter,
          dateToFilter,
          sortBy,
          sortDirection,
        }),
      ),
  });

  const orderDetailQuery = useQuery({
    queryKey: ["order-detail", selectedOrderId],
    queryFn: () => apiFetch<SalesOrderDetail>(`/sales/orders/${selectedOrderId}`),
    enabled: Boolean(selectedOrderId),
  });

  const orderActivityQuery = useQuery({
    queryKey: ["order-activity", selectedOrderId],
    queryFn: () =>
      apiFetch<PagedResponse<ActivityEntry>>(`/sales/orders/${selectedOrderId}/activity?page=1&pageSize=20`),
    enabled: Boolean(selectedOrderId),
  });

  const createFulfillmentMutation = useMutation({
    mutationFn: async (payload: {
      skuId: string;
      soId: string;
      quantity: number;
      warehouseId: string;
      palletLocationId?: string;
    }) =>
      apiFetch("/inventory/movements", {
        method: "POST",
        body: JSON.stringify({
          skuId: payload.skuId,
          movementType: "OUTBOUND",
          quantity: payload.quantity,
          warehouseId: payload.warehouseId,
          palletLocationId: payload.palletLocationId,
          referenceType: "SALES_ORDER",
          referenceId: payload.soId,
          reason: "Fulfilled from sales order detail panel",
        }),
      }),
    onSuccess: async (_, variables) => {
      setError("");
      setFulfillmentForm((current) => ({
        ...current,
        [variables.skuId]: {
          quantity: "1",
          warehouseId: current[variables.skuId]?.warehouseId ?? variables.warehouseId,
          palletLocationId: "",
        },
      }));
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["order-detail", variables.soId] });
      await queryClient.invalidateQueries({ queryKey: ["order-activity", variables.soId] });
      await queryClient.invalidateQueries({ queryKey: ["skus"] });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Could not post linked outbound");
    },
  });

  useEffect(() => {
    if (customerParam && customerParam !== customerFilter) {
      setCustomerFilter(customerParam);
    }
  }, [customerFilter, customerParam]);

  useEffect(() => {
    if (skuParam && skuParam !== skuFilter) {
      setSkuFilter(skuParam);
    }
  }, [skuFilter, skuParam]);

  useEffect(() => {
    if (selectedOrderParam && selectedOrderParam !== selectedOrderId) {
      setSelectedOrderId(selectedOrderParam);
      return;
    }

    if (!selectedOrderId && ordersQuery.data?.items.length) {
      setSelectedOrderId(ordersQuery.data.items[0].id);
    }
  }, [ordersQuery.data, selectedOrderId, selectedOrderParam]);

  useEffect(() => {
    if (!orderDetailQuery.data || orderDetailQuery.data.status !== "DRAFT") {
      setDraftEditor(null);
      setLastAutoSavedAt("");
    } else {
      setDraftEditor(toDraftEditorState(orderDetailQuery.data));
      setLastAutoSavedAt("");
    }
  }, [orderDetailQuery.data]);

  useEffect(() => {
    const order = orderDetailQuery.data;
    const warehouses = warehousesQuery.data?.items ?? [];

    if (!order || !warehouses.length) {
      return;
    }

    const laMiradaWarehouse = warehouses.find((warehouse) => warehouse.code === "LA_MIRADA");
    const defaultWarehouseId = laMiradaWarehouse?.id ?? warehouses[0].id;

    setFulfillmentForm((current) => {
      const next = { ...current };

      for (const reservation of order.reservations) {
        if (!next[reservation.skuId]) {
          next[reservation.skuId] = {
            quantity: String(Math.max(1, reservation.quantityReserved)),
            warehouseId: defaultWarehouseId,
            palletLocationId: "",
          };
        }
      }

      return next;
    });
  }, [orderDetailQuery.data, warehousesQuery.data]);

  useEffect(() => {
    if (!canAccessCustomers) {
      return;
    }

    const firstCustomer = customersQuery.data?.items[0];
    const firstSku = skusQuery.data?.items[0];

    setForm((current) => ({
      ...current,
      customerId: current.customerId || firstCustomer?.id || "",
      lines: current.lines.map((line) =>
        line.skuId
          ? line
          : {
              ...line,
              skuId: firstSku?.id ?? "",
              productDescription: line.productDescription || firstSku?.productName || "",
              unitPrice: line.unitPrice !== "0.00" ? line.unitPrice : firstSku?.sellingPrice ?? line.unitPrice,
            },
      ),
    }));
  }, [canAccessCustomers, customersQuery.data, skusQuery.data]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, customerFilter, skuFilter, dateFromFilter, dateToFilter, pageSize, sortBy, sortDirection]);

  const createOrderMutation = useMutation({
    mutationFn: async () =>
      apiFetch<SalesOrderDetail>("/sales/orders", {
        method: "POST",
        body: JSON.stringify({
          customerId: form.customerId,
          soNumber: form.soNumber || undefined,
          subtotalAmount: Number(form.subtotalAmount || calculateDraftLineSubtotal(form.lines)),
          shippingCharge: Number(form.shippingCharge) || 0,
          notes: form.notes,
          lines: form.lines.map((line) => ({
            skuId: line.skuId,
            productDescription: line.productDescription || undefined,
            quantityOrdered: Number(line.quantityOrdered),
            unitPrice: Number(line.unitPrice),
          })),
        }),
      }),
    onSuccess: async (order) => {
      setSelectedOrderId(order.id);
      setError("");
      setForm({
        soNumber: "",
        customerId: form.customerId,
        subtotalAmount: "",
        shippingCharge: "0.00",
        notes: "",
        lines: [createEmptyLine(skusQuery.data?.items[0])],
      });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["order-detail"] });
      await queryClient.invalidateQueries({ queryKey: ["skus"] });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Could not create order");
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: async (payload: { orderId: string; formState: OrderFormState }) =>
      apiFetch<SalesOrderDetail>(`/sales/orders/${payload.orderId}`, {
        method: "PUT",
        body: JSON.stringify({
          customerId: payload.formState.customerId,
          soNumber: payload.formState.soNumber || undefined,
          subtotalAmount: Number(payload.formState.subtotalAmount || calculateDraftLineSubtotal(payload.formState.lines)),
          shippingCharge: Number(payload.formState.shippingCharge) || 0,
          notes: payload.formState.notes,
          lines: payload.formState.lines.map((line) => ({
            skuId: line.skuId,
            productDescription: line.productDescription || undefined,
            quantityOrdered: Number(line.quantityOrdered),
            unitPrice: Number(line.unitPrice),
          })),
        }),
      }),
    onSuccess: async (order) => {
      setError("");
      setDraftEditor(toDraftEditorState(order));
      if (autoSaveTriggeredRef.current) {
        setLastAutoSavedAt(new Date().toLocaleTimeString());
        autoSaveTriggeredRef.current = false;
      }
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["order-detail", order.id] });
      await queryClient.invalidateQueries({ queryKey: ["skus"] });
    },
    onError: (mutationError) => {
      autoSaveTriggeredRef.current = false;
      setError(mutationError instanceof Error ? mutationError.message : "Could not update draft order");
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (orderId: string) =>
      apiFetch<void>(`/sales/orders/${orderId}`, {
        method: "DELETE",
      }),
    onSuccess: async (_, deletedOrderId) => {
      setError("");
      setDraftEditor(null);
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["order-detail"] });

      const refreshedOrders = await queryClient.fetchQuery({
        queryKey: [
          "orders",
          search,
          statusFilter,
          customerFilter,
          skuFilter,
          dateFromFilter,
          dateToFilter,
          page,
          pageSize,
          sortBy,
          sortDirection,
        ],
        queryFn: () =>
          apiFetch<PagedResponse<SalesOrderSummary>>(
            buildOrdersUrl({
              page,
              pageSize,
              search,
              statusFilter,
              customerFilter,
              skuFilter,
              dateFromFilter,
              dateToFilter,
              sortBy,
              sortDirection,
            }),
          ),
      });

      const nextOrder = refreshedOrders.items.find((order) => order.id !== deletedOrderId) ?? refreshedOrders.items[0];
      const nextId = nextOrder?.id ?? "";
      setSelectedOrderId(nextId);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (nextId) {
          next.set("selected", nextId);
        } else {
          next.delete("selected");
        }
        return next;
      });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Could not delete draft order");
    },
  });

  const confirmOrderMutation = useMutation({
    mutationFn: async (orderId: string) =>
      apiFetch<SalesOrderDetail>(`/sales/orders/${orderId}/confirm`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["order-detail"] });
      await queryClient.invalidateQueries({ queryKey: ["skus"] });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Could not confirm order");
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) =>
      apiFetch<SalesOrderDetail>(`/sales/orders/${orderId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "Cancelled from orders page" }),
      }),
    onSuccess: async () => {
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["order-detail"] });
      await queryClient.invalidateQueries({ queryKey: ["skus"] });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Could not cancel order");
    },
  });

  const duplicateOrderMutation = useMutation({
    mutationFn: async (order: SalesOrderDetail) =>
      apiFetch<SalesOrderDetail>("/sales/orders", {
        method: "POST",
        body: JSON.stringify({
          customerId: order.customerId,
          notes: [`Duplicated from ${order.soNumber}.`, order.notes ?? ""].filter(Boolean).join("\n"),
          lines: order.lines.map((line) => ({
            skuId: line.skuId,
            productDescription: line.productDescription ?? line.productName ?? "",
            quantityOrdered: line.quantityOrdered,
            unitPrice: Number(line.unitPrice),
          })),
        }),
      }),
    onSuccess: async (order) => {
      setError("");
      setSelectedOrderId(order.id);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("selected", order.id);
        next.delete("from");
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["order-detail"] });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Could not duplicate order into a draft");
    },
  });

  function handleCreateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createOrderMutation.mutate();
  }

  if (isNewMode && !canCreateOrders) {
    return <AccessDeniedPanel message="Only Admin and Manager users can create new sales orders." />;
  }

  const selectedOrder = orderDetailQuery.data;
  const selectedOrderIsImported = isImportedHistoricalOrder(selectedOrder);
  const returnCustomerId = customerParam || selectedOrder?.customerId || "";
  const showCustomerReturnLink =
    !isNewMode && sourceParam === "customer" && Boolean(returnCustomerId) && canAccessCustomers;
  const activeSkus = skusQuery.data?.items ?? [];
  const orderDraftLineSubtotal = calculateDraftLineSubtotal(form.lines);
  const orderDraftTotal = calculateDraftTotal(form);

  function addLine() {
    setForm((current) => ({
      ...current,
      lines: [...current.lines, createEmptyLine(activeSkus[0])],
    }));
  }

  function removeLine(index: number) {
    setForm((current) => ({
      ...current,
      lines: current.lines.length === 1 ? current.lines : current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
  }

  function updateLine(index: number, field: keyof DraftOrderLine, value: string) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => {
        if (lineIndex !== index) {
          return line;
        }

        if (field === "skuId") {
          const nextSku = activeSkus.find((sku) => sku.id === value);
          return {
            ...line,
            skuId: value,
            productDescription: nextSku ? nextSku.productName : line.productDescription,
            unitPrice: nextSku ? nextSku.sellingPrice : line.unitPrice,
          };
        }

        return {
          ...line,
          [field]: value,
        };
      }),
    }));
  }

  function addDraftEditorLine() {
    setDraftEditor((current) =>
      current
        ? {
            ...current,
            lines: [...current.lines, createEmptyLine(activeSkus[0])],
          }
        : current,
    );
  }

  function removeDraftEditorLine(index: number) {
    setDraftEditor((current) =>
      current
        ? {
            ...current,
            lines:
              current.lines.length === 1
                ? current.lines
                : current.lines.filter((_, lineIndex) => lineIndex !== index),
          }
        : current,
    );
  }

  function updateDraftEditorLine(index: number, field: keyof DraftOrderLine, value: string) {
    setDraftEditor((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line, lineIndex) => {
              if (lineIndex !== index) {
                return line;
              }

              if (field === "skuId") {
                const nextSku = activeSkus.find((sku) => sku.id === value);
                return {
                  ...line,
                  skuId: value,
                  productDescription: nextSku ? nextSku.productName : line.productDescription,
                  unitPrice: nextSku ? nextSku.sellingPrice : line.unitPrice,
                };
              }

              return {
                ...line,
                [field]: value,
              };
            }),
          }
        : current,
    );
  }

  const draftEditorTotal = draftEditor ? calculateDraftTotal(draftEditor) : 0;

  const isDraftDirty =
    selectedOrder?.status === "DRAFT" &&
    draftEditor !== null &&
    JSON.stringify({
      soNumber: selectedOrder.soNumber,
      customerId: selectedOrder.customerId,
      subtotalAmount: String(selectedOrder.subtotalAmount ?? selectedOrder.totalAmount),
      shippingCharge: String(selectedOrder.shippingCharge ?? "0.00"),
      notes: selectedOrder.notes ?? "",
      lines: selectedOrder.lines.map((line) => ({
        skuId: line.skuId,
        productDescription: line.productDescription ?? line.productName ?? "",
        quantityOrdered: String(line.quantityOrdered),
        unitPrice: String(line.unitPrice),
      })),
    }) !== JSON.stringify(draftEditor);

  useEffect(() => {
    if (
      !selectedOrder ||
      selectedOrder.status !== "DRAFT" ||
      !draftEditor ||
      !isDraftDirty ||
      updateDraftMutation.isPending ||
      deleteDraftMutation.isPending
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      autoSaveTriggeredRef.current = true;
      updateDraftMutation.mutate({
        orderId: selectedOrder.id,
        formState: draftEditor,
      });
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [deleteDraftMutation.isPending, draftEditor, isDraftDirty, selectedOrder, updateDraftMutation]);

  useEffect(() => {
    if (!isDraftDirty) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDraftDirty]);

  function resetDraftEditor() {
    if (!selectedOrder || selectedOrder.status !== "DRAFT") {
      return;
    }

    setDraftEditor(toDraftEditorState(selectedOrder));
    setError("");
  }

  function handleDeleteDraft(orderId: string, soNumber: string) {
    const confirmed = window.confirm(`Delete draft order ${soNumber}? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }

    deleteDraftMutation.mutate(orderId);
  }

  function handleSelectOrder(nextOrderId: string) {
    if (nextOrderId === selectedOrderId) {
      return;
    }

    if (isDraftDirty) {
      const confirmed = window.confirm(
        "You have unsaved draft changes. Leave this draft and discard those changes?",
      );

      if (!confirmed) {
        return;
      }
    }

    setError("");
    setSelectedOrderId(nextOrderId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("selected", nextOrderId);
      return next;
    });
  }

  const totalOrders = ordersQuery.data?.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize));
  const warehouses = warehousesQuery.data?.items ?? [];
  const palletLocations = palletLocationsQuery.data?.items ?? [];

  function getPalletOptionsForWarehouse(warehouseId: string) {
    return palletLocations.filter((pallet) => pallet.warehouseId === warehouseId);
  }

  function handleFulfillmentChange(skuId: string, field: keyof FulfillmentLineState, value: string) {
    setFulfillmentForm((current) => ({
      ...current,
      [skuId]: {
        quantity: current[skuId]?.quantity ?? "1",
        warehouseId: current[skuId]?.warehouseId ?? "",
        palletLocationId: current[skuId]?.palletLocationId ?? "",
        [field]: value,
        ...(field === "warehouseId" ? { palletLocationId: "" } : {}),
      },
    }));
  }

  function handleShipReservation(
    reservation: SalesOrderDetail["reservations"][number],
    soId: string,
  ) {
    const line = fulfillmentForm[reservation.skuId];
    const warehouse = warehouses.find((item) => item.id === line?.warehouseId);
    const quantity = Number(line?.quantity ?? 0);

    if (!warehouse) {
      setError("Select a warehouse before shipping this reservation line.");
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("Enter a valid shipment quantity.");
      return;
    }

    if (quantity > reservation.quantityReserved) {
      setError("Shipment quantity cannot exceed the reserved quantity.");
      return;
    }

    if (warehouse.isPalletTracked && !line?.palletLocationId) {
      setError("Select a source pallet for La Mirada fulfillment.");
      return;
    }

    createFulfillmentMutation.mutate({
      skuId: reservation.skuId,
      soId,
      quantity,
      warehouseId: warehouse.id,
      palletLocationId: line?.palletLocationId || undefined,
    });
  }

  return (
    <section className="space-y-6">
      {!isNewMode ? (
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Sales Orders</h2>
          <p className="text-sm text-neutral-500">
            Review your sales order queue, edit draft documents, confirm reservations, and monitor fulfillment progress.
          </p>
        </div>
          <div className="space-y-3">
            {sourceParam === "customer" && customerFilter ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                <div>
                  <p className="font-medium">Customer context is active for this order queue.</p>
                  <p className="text-green-800">You are reviewing orders from a customer record and can return there at any time.</p>
                </div>
                <Link
                  className="rounded-md border border-green-300 bg-white px-3 py-2 font-medium text-green-800 hover:bg-green-100"
                  to={`/sales/customers?selected=${customerFilter}`}
                >
                  Back to Customer Record
                </Link>
              </div>
            ) : null}
            {sourceParam === "product" && skuFilter ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                <div>
                  <p className="font-medium">Product context is active for this order queue.</p>
                  <p className="text-sky-800">
                    You are reviewing sales orders related to {skuLabelParam || "the selected SKU"}.
                  </p>
                </div>
                <Link
                  className="rounded-md border border-sky-300 bg-white px-3 py-2 font-medium text-sky-800 hover:bg-sky-100"
                  to={skuParam ? `/inventory/stock-overview/${skuParam}` : "/inventory/stock-overview"}
                >
                  Back to Product
                </Link>
              </div>
            ) : null}
            <div className={`grid gap-3 sm:grid-cols-2 ${canAccessCustomers ? "xl:grid-cols-7" : "xl:grid-cols-6"}`}>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Search</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="SO number or customer"
                value={search}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Status</span>
              <select
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setStatusFilter(event.target.value)}
                value={statusFilter}
              >
                <option value="">All</option>
                <option value="DRAFT">Draft</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="SHIPPED">Shipped</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            {canAccessCustomers ? (
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Customer</span>
                <select
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                  onChange={(event) => setCustomerFilter(event.target.value)}
                  value={customerFilter}
                >
                  <option value="">All customers</option>
                  {customersQuery.data?.items.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.companyName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Order Date From</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setDateFromFilter(event.target.value)}
                type="date"
                value={dateFromFilter}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Order Date To</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setDateToFilter(event.target.value)}
                type="date"
                value={dateToFilter}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Sort By</span>
              <select
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setSortBy(event.target.value)}
                value={sortBy}
              >
                <option value="updatedAt">Last Updated</option>
                <option value="orderDate">Order Date</option>
                <option value="totalAmount">Total Amount</option>
                <option value="soNumber">SO Number</option>
                <option value="customerName">Customer</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Direction</span>
              <select
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setSortDirection(event.target.value)}
                value={sortDirection}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
            </div>
          </div>
      </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {ordersQuery.isLoading && !isNewMode ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
          Loading sales orders...
        </div>
      ) : null}
      {ordersQuery.isError && !isNewMode ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load sales orders from the database.
        </div>
      ) : null}

      {isNewMode ? (
        <div>
          <OrderCreationCard
            customers={customersQuery.data?.items ?? []}
            calculatedSubtotal={orderDraftLineSubtotal}
            form={form}
            lineTotal={orderDraftTotal}
            onAddLine={addLine}
            onChangeLine={updateLine}
            onChangeNotes={(notes) => setForm((current) => ({ ...current, notes }))}
            onChangeCustomer={(customerId) => setForm((current) => ({ ...current, customerId }))}
            onChangeField={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
            onRemoveLine={removeLine}
            onSubmit={handleCreateOrder}
            pending={createOrderMutation.isPending}
            skus={activeSkus}
          />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_1.35fr]">
          <div className="space-y-6">
            <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 p-5">
              <div>
                <h3 className="text-lg font-semibold">Order Queue</h3>
                <p className="text-sm text-neutral-500">
                  Filter the queue, open any document, and work the draft-to-confirmed flow from one place.
                </p>
              </div>
              {canCreateOrders ? (
                <Link
                  className="rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                  to="/sales/orders/new"
                >
                  New Sales Order
                </Link>
              ) : null}
            </div>

            <div className="rounded-xl border border-neutral-200">
              <div className="border-b border-neutral-200 px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Documents</h3>
                    <p className="text-sm text-neutral-500">{totalOrders} orders in the current filter.</p>
                  </div>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Page Size</span>
                    <select
                      className="w-full rounded-md border border-neutral-300 px-3 py-2"
                      onChange={(event) => setPageSize(Number(event.target.value))}
                      value={pageSize}
                    >
                      <option value="8">8</option>
                      <option value="12">12</option>
                      <option value="20">20</option>
                      <option value="50">50</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="divide-y divide-neutral-200">
                {ordersQuery.data?.items.map((order) => (
                  <button
                    key={order.id}
                    className={[
                      "w-full px-5 py-4 text-left transition-colors hover:bg-neutral-50",
                      selectedOrderId === order.id ? "bg-green-50 ring-1 ring-inset ring-green-200" : "bg-white",
                    ].join(" ")}
                    onClick={() => handleSelectOrder(order.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{order.soNumber}</p>
                          {isImportedHistoricalOrder(order) ? (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                              Imported History
                            </span>
                          ) : null}
                          {selectedOrderId === order.id && order.status === "DRAFT" && isDraftDirty ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                              Unsaved
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-neutral-500">{order.customerCompanyName}</p>
                      </div>
                      <StatusBadge>{order.status}</StatusBadge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-neutral-500">
                      <span>{new Date(order.orderDate).toLocaleString()}</span>
                      <span>${order.totalAmount}</span>
                    </div>
                  </button>
                ))}
                {!ordersQuery.data?.items.length ? (
                  <div className="px-5 py-6 text-sm text-neutral-500">No orders match the current filter.</div>
                ) : null}
              </div>
              <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-4 text-sm">
                <p className="text-neutral-500">
                  Page {page} of {totalPages}
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
            </div>
          </div>

          <div className="space-y-6">
            {selectedOrder ? (
              <div className="space-y-6 rounded-xl border border-neutral-200 p-5">
                <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-[linear-gradient(135deg,#f8faf7_0%,#eef4ec_100%)]">
                  <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-4">
                      {showCustomerReturnLink ? (
                        <Link
                          className="inline-flex items-center rounded-full border border-green-200 bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-green-800 hover:bg-white"
                          to={`/sales/customers?selected=${returnCustomerId}`}
                        >
                          Back to Customer Record
                        </Link>
                      ) : null}
                      {selectedOrderIsImported ? (
                        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                          <p className="font-semibold">Imported Historical Order</p>
                          <p className="mt-1 text-sky-800">
                            This document came from the reference sales sheet and is preserved as historical context.
                            Duplicate it into a draft before making operational changes.
                          </p>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                          Sales Order
                        </span>
                        {selectedOrderIsImported ? (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                            Imported Historical Order
                          </span>
                        ) : null}
                        <StatusBadge>{selectedOrder.status}</StatusBadge>
                      </div>
                      <div>
                        <h3 className="text-3xl font-semibold tracking-tight">{selectedOrder.soNumber}</h3>
                        <p className="mt-2 text-sm text-neutral-600">
                          {selectedOrder.customerCompanyName} · {selectedOrder.customerPaymentTerms}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">{selectedOrder.notes ?? "No notes"}</p>
                      </div>
                      {isDraftDirty ? (
                        <p className="text-sm text-amber-700">
                          Draft changes are unsaved. Auto-save will run shortly, or you can save manually.
                        </p>
                      ) : null}
                      {!isDraftDirty && lastAutoSavedAt ? (
                        <p className="text-sm text-green-700">Auto-saved at {lastAutoSavedAt}.</p>
                      ) : null}
                      {updateDraftMutation.isPending && selectedOrder.status === "DRAFT" ? (
                        <p className="text-sm text-neutral-500">Saving draft changes...</p>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-neutral-200 bg-white/90 p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Action Panel</p>
                          <h4 className="mt-2 text-base font-semibold">Next Best Action</h4>
                        </div>
                        <StatusBadge>{selectedOrder.status}</StatusBadge>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-white/70 bg-white/80 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Order Date</p>
                          <p className="mt-2 text-sm font-medium">{new Date(selectedOrder.orderDate).toLocaleDateString()}</p>
                        </div>
                        <div className="rounded-xl border border-white/70 bg-white/80 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Total</p>
                          <p className="mt-2 text-sm font-medium">
                            ${selectedOrder.status === "DRAFT" && draftEditor ? draftEditorTotal.toFixed(2) : selectedOrder.totalAmount}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Recommended</p>
                        <p className="mt-2 text-sm text-neutral-700">
                          {selectedOrderIsImported
                            ? "Historical imports are best treated as reference records. Duplicate this order into a draft before editing or reworking it."
                            : selectedOrder.status === "DRAFT"
                            ? "Review lines and notes, then confirm this order to reserve stock."
                            : selectedOrder.status === "CONFIRMED"
                              ? "Reserve is active. Use the fulfillment panel below to ship reservation lines directly from this order."
                              : selectedOrder.status === "SHIPPED"
                                ? "This order has completed shipment. Review reservations and audit history if needed."
                                : "No further operational action is required for this order right now."}
                        </p>
                      </div>
                      {selectedOrder.status === "CONFIRMED" ? (
                        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                                Fulfillment Panel
                              </p>
                              <p className="mt-2 text-sm text-blue-900">
                                Ship each reserved SKU from the order itself. La Mirada requires a source pallet.
                              </p>
                            </div>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                              Linked Outbound
                            </span>
                          </div>
                          <div className="mt-4 space-y-3">
                            {selectedOrder.reservations
                              .filter((reservation) => reservation.status === "ACTIVE" && reservation.quantityReserved > 0)
                              .map((reservation) => {
                                const line = fulfillmentForm[reservation.skuId] ?? {
                                  quantity: String(reservation.quantityReserved),
                                  warehouseId: "",
                                  palletLocationId: "",
                                };
                                const warehouse = warehouses.find((item) => item.id === line.warehouseId);
                                const palletOptions = getPalletOptionsForWarehouse(line.warehouseId);

                                return (
                                  <div key={reservation.id} className="rounded-xl border border-blue-100 bg-white px-4 py-4">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="font-medium text-neutral-900">{reservation.skuCode}</p>
                                        <p className="mt-1 text-sm text-neutral-500">{reservation.productName}</p>
                                      </div>
                                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                                        Reserved {reservation.quantityReserved}
                                      </span>
                                    </div>
                                    <div className="mt-4 grid gap-3">
                                      <div className="grid gap-3 md:grid-cols-2">
                                        <label className="space-y-1">
                                          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Warehouse</span>
                                          <select
                                            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                                            onChange={(event) =>
                                              handleFulfillmentChange(reservation.skuId, "warehouseId", event.target.value)
                                            }
                                            value={line.warehouseId}
                                          >
                                            <option value="">Select warehouse</option>
                                            {warehouses.map((item) => (
                                              <option key={item.id} value={item.id}>
                                                {item.name}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="space-y-1">
                                          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Ship Quantity</span>
                                          <input
                                            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                                            max={reservation.quantityReserved}
                                            min={1}
                                            onChange={(event) =>
                                              handleFulfillmentChange(reservation.skuId, "quantity", event.target.value)
                                            }
                                            type="number"
                                            value={line.quantity}
                                          />
                                        </label>
                                      </div>
                                      {warehouse?.isPalletTracked ? (
                                        <label className="space-y-1">
                                          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Pick From Pallet</span>
                                          <select
                                            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                                            onChange={(event) =>
                                              handleFulfillmentChange(reservation.skuId, "palletLocationId", event.target.value)
                                            }
                                            value={line.palletLocationId}
                                          >
                                            <option value="">Select source pallet</option>
                                            {palletOptions.map((pallet) => (
                                              <option key={pallet.id} value={pallet.id}>
                                                {pallet.code} · {pallet.zone ?? pallet.label}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                      ) : warehouse ? (
                                        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-600">
                                          {warehouse.name} does not use pallet tracking, so this shipment will post at warehouse level.
                                        </div>
                                      ) : null}
                                      <button
                                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                                        disabled={createFulfillmentMutation.isPending || !canFulfillOrders}
                                        onClick={() => handleShipReservation(reservation, selectedOrder.id)}
                                        type="button"
                                      >
                                        {createFulfillmentMutation.isPending ? "Posting Shipment..." : "Ship Reserved Stock"}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            {!selectedOrder.reservations.filter((reservation) => reservation.status === "ACTIVE" && reservation.quantityReserved > 0).length ? (
                              <div className="rounded-xl border border-dashed border-blue-200 px-4 py-4 text-sm text-blue-800">
                                No active reservation lines remain to fulfill on this order.
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-4 grid gap-2">
                        {canManageOrders ? (
                          <button
                            className="w-full rounded-md border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-60"
                            disabled={duplicateOrderMutation.isPending}
                            onClick={() => duplicateOrderMutation.mutate(selectedOrder)}
                            type="button"
                          >
                            {duplicateOrderMutation.isPending ? "Duplicating..." : "Duplicate as Draft"}
                          </button>
                        ) : null}
                        {selectedOrder.status === "DRAFT" && draftEditor && canManageOrders ? (
                          <button
                            className="w-full rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                            disabled={!isDraftDirty || updateDraftMutation.isPending}
                            onClick={resetDraftEditor}
                            type="button"
                          >
                            Reset
                          </button>
                        ) : null}
                        {selectedOrder.status === "DRAFT" && draftEditor && canManageOrders ? (
                          <button
                            className="w-full rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                            disabled={!isDraftDirty || updateDraftMutation.isPending}
                            onClick={() => {
                              autoSaveTriggeredRef.current = false;
                              updateDraftMutation.mutate({
                                orderId: selectedOrder.id,
                                formState: draftEditor,
                              });
                            }}
                            type="button"
                          >
                            {updateDraftMutation.isPending ? "Saving..." : "Save Draft"}
                          </button>
                        ) : null}
                        {selectedOrder.status === "DRAFT" && canManageOrders ? (
                          <button
                            className="w-full rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                            disabled={deleteDraftMutation.isPending}
                            onClick={() => handleDeleteDraft(selectedOrder.id, selectedOrder.soNumber)}
                            type="button"
                          >
                            {deleteDraftMutation.isPending ? "Deleting..." : "Delete Draft"}
                          </button>
                        ) : null}
                        {selectedOrder.status === "DRAFT" && canManageOrders ? (
                          <button
                            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                            disabled={
                              confirmOrderMutation.isPending || deleteDraftMutation.isPending || Boolean(isDraftDirty)
                            }
                            onClick={() => confirmOrderMutation.mutate(selectedOrder.id)}
                            type="button"
                          >
                            Confirm Order
                          </button>
                        ) : null}
                        {canManageOrders && (selectedOrder.status === "DRAFT" || selectedOrder.status === "CONFIRMED") ? (
                          <button
                            className="w-full rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                            disabled={cancelOrderMutation.isPending}
                            onClick={() => cancelOrderMutation.mutate(selectedOrder.id)}
                            type="button"
                          >
                            Cancel Order
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Created By</p>
                          <p className="mt-2 text-sm font-medium">{selectedOrder.createdByName ?? selectedOrder.createdBy}</p>
                        </div>
                        <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Updated</p>
                          <p className="mt-2 text-sm font-medium">{new Date(selectedOrder.updatedAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1.25fr_1fr]">
                  <div className="rounded-xl border border-neutral-200 bg-white p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Document Status</p>
                        <h4 className="mt-2 text-base font-semibold">Order Timeline</h4>
                      </div>
                      <span className="text-xs text-neutral-500">
                        Updated {new Date(selectedOrder.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3">
                      {getOrderStatusSteps(selectedOrder.status).map((step, index, steps) => (
                        <div key={step.key} className="flex min-w-[120px] flex-1 items-center gap-3">
                          <div
                            className={[
                              "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold",
                              step.current
                                ? "border-green-600 bg-green-600 text-white"
                                : step.complete
                                  ? "border-green-200 bg-green-50 text-green-700"
                                  : "border-neutral-200 bg-white text-neutral-400",
                            ].join(" ")}
                          >
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-neutral-800">{step.label}</p>
                            <div className="mt-2 h-1.5 rounded-full bg-neutral-100">
                              <div
                                className={[
                                  "h-1.5 rounded-full",
                                  step.complete ? "bg-green-500" : "bg-neutral-200",
                                ].join(" ")}
                                style={{ width: "100%" }}
                              />
                            </div>
                          </div>
                          {index < steps.length - 1 ? <div className="hidden w-3 lg:block" /> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-1">
                  <MetricCard
                    label="Total Amount"
                    value={`$${selectedOrder.status === "DRAFT" && draftEditor ? draftEditorTotal.toFixed(2) : selectedOrder.totalAmount}`}
                  />
                  <MetricCard
                    label="Line Count"
                    value={String(selectedOrder.status === "DRAFT" && draftEditor ? draftEditor.lines.length : selectedOrder.lines.length)}
                  />
                  <MetricCard
                    label="Active Reservations"
                    value={String(selectedOrder.reservations.filter((reservation) => reservation.status === "ACTIVE").length)}
                  />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold">
                      {selectedOrder.status === "DRAFT" ? "Draft Line Items" : "Line Items"}
                    </h4>
                    {selectedOrder.status === "DRAFT" && draftEditor && canManageOrders ? (
                      <button
                        className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                        onClick={addDraftEditorLine}
                        type="button"
                      >
                        Add Line
                      </button>
                    ) : null}
                  </div>

                  {selectedOrder.status === "DRAFT" && draftEditor && canManageOrders ? (
                    <DraftEditorSection
                      customers={customersQuery.data?.items ?? []}
                      draftEditor={draftEditor}
                      onChangeCustomer={(customerId) =>
                        setDraftEditor((current) => (current ? { ...current, customerId } : current))
                      }
                      onChangeField={(field, value) =>
                        setDraftEditor((current) => (current ? { ...current, [field]: value } : current))
                      }
                      onChangeLine={updateDraftEditorLine}
                      onChangeNotes={(notes) =>
                        setDraftEditor((current) => (current ? { ...current, notes } : current))
                      }
                      onRemoveLine={removeDraftEditorLine}
                      skus={activeSkus}
                    />
                  ) : (
                    <ReadonlyLinesTable lines={selectedOrder.lines} />
                  )}
                </div>

                <div>
                  <h4 className="text-base font-semibold">Reservations</h4>
                  <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200">
                    <table className="min-w-full divide-y divide-neutral-200">
                      <thead className="bg-neutral-50">
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Reserved Qty</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 bg-white text-sm">
                        {selectedOrder.reservations.length ? (
                          selectedOrder.reservations.map((reservation) => (
                            <tr key={reservation.id}>
                              <td className="px-4 py-3">
                                <p className="font-medium">{reservation.skuCode}</p>
                                <p className="text-neutral-500">{reservation.productName}</p>
                              </td>
                              <td className="px-4 py-3">{reservation.quantityReserved}</td>
                              <td className="px-4 py-3">
                                <StatusBadge>{reservation.status}</StatusBadge>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="px-4 py-4 text-neutral-500" colSpan={3}>
                              No reservations yet. Confirm the order to reserve stock.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold">Activity & Audit</h4>
                    <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                      {orderActivityQuery.data?.pagination.total ?? 0} events
                    </span>
                  </div>
                  <div className="mt-3 rounded-xl border border-neutral-200 bg-white">
                    <div className="divide-y divide-neutral-200">
                      {orderActivityQuery.data?.items.map((entry) => (
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
                      {!orderActivityQuery.data?.items.length ? (
                        <div className="px-5 py-6 text-sm text-neutral-500">No activity recorded for this order yet.</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500">
                Select an order from the queue to inspect line items, reservations, and draft edit actions.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function OrderCreationCard({
  customers,
  calculatedSubtotal,
  form,
  lineTotal,
  onAddLine,
  onChangeCustomer,
  onChangeField,
  onChangeLine,
  onChangeNotes,
  onRemoveLine,
  onSubmit,
  pending,
  skus,
}: {
  customers: Customer[];
  calculatedSubtotal: number;
  form: OrderFormState;
  lineTotal: number;
  onAddLine: () => void;
  onChangeCustomer: (customerId: string) => void;
  onChangeField: (field: "soNumber" | "subtotalAmount" | "shippingCharge", value: string) => void;
  onChangeLine: (index: number, field: keyof DraftOrderLine, value: string) => void;
  onChangeNotes: (notes: string) => void;
  onRemoveLine: (index: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  skus: Sku[];
}) {
  return (
    <form className="space-y-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm" onSubmit={onSubmit}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4">
        <div>
          <h2 className="text-xl font-semibold">Sales Order Form</h2>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          to="/sales/orders"
        >
          Existing Orders
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Sales Order Number</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            onChange={(event) => onChangeField("soNumber", event.target.value)}
            placeholder="Enter SO number"
            value={form.soNumber}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Customer</span>
          <select
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            onChange={(event) => onChangeCustomer(event.target.value)}
            value={form.customerId}
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.companyName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <div>
            <h4 className="text-base font-semibold">Order Lines</h4>
          </div>
          <button
            className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            onClick={onAddLine}
            type="button"
          >
            Add Line
          </button>
        </div>

        <div className="space-y-3">
          {form.lines.map((line, index) => (
            <EditableLineCard
              key={`${line.skuId || "new"}-${index}`}
              disableRemove={form.lines.length === 1}
              line={line}
              onChange={onChangeLine}
              onRemove={onRemoveLine}
              rowIndex={index}
              skus={skus}
            />
          ))}
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Notes</span>
        <textarea
          className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2"
          onChange={(event) => onChangeNotes(event.target.value)}
          value={form.notes}
        />
      </label>
      <div className="grid gap-4 border-t border-neutral-200 pt-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1">
          <span className="text-sm font-medium">Calculated Line Subtotal</span>
          <input
            className="w-full rounded-md border border-neutral-200 bg-neutral-100 px-3 py-2 text-neutral-600"
            readOnly
            value={`$${calculatedSubtotal.toFixed(2)}`}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Subtotal</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            min="0"
            onChange={(event) => onChangeField("subtotalAmount", event.target.value)}
            placeholder={calculatedSubtotal.toFixed(2)}
            step="0.01"
            type="number"
            value={form.subtotalAmount}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Shipping Charge</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            min="0"
            onChange={(event) => onChangeField("shippingCharge", event.target.value)}
            step="0.01"
            type="number"
            value={form.shippingCharge}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Order Total</span>
          <input
            className="w-full rounded-md border border-neutral-200 bg-neutral-100 px-3 py-2 font-semibold text-neutral-900"
            readOnly
            value={`$${lineTotal.toFixed(2)}`}
          />
        </label>
      </div>
      <button
        className="rounded-md bg-brand-primary px-4 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Creating..." : "Create New Sales Order"}
      </button>
    </form>
  );
}

function EditableLineCard({
  disableRemove,
  line,
  onChange,
  onRemove,
  rowIndex,
  skus,
}: {
  disableRemove: boolean;
  line: DraftOrderLine;
  onChange: (index: number, field: keyof DraftOrderLine, value: string) => void;
  onRemove: (index: number) => void;
  rowIndex: number;
  skus: Sku[];
}) {
  const selectedSku = skus.find((sku) => sku.id === line.skuId);
  const lineTotal = ((Number(line.quantityOrdered) || 0) * (Number(line.unitPrice) || 0)).toFixed(2);

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)]">
        <label className="space-y-1">
          <span className="text-sm font-medium">SKU</span>
          <select
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            onChange={(event) => onChange(rowIndex, "skuId", event.target.value)}
            value={line.skuId}
          >
            <option value="">Select SKU</option>
            {skus.map((sku) => (
              <option key={sku.id} value={sku.id}>
                {sku.skuCode} · {sku.productName}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Product Description</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            onChange={(event) => onChange(rowIndex, "productDescription", event.target.value)}
            value={line.productDescription}
          />
        </label>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[130px_150px_minmax(150px,1fr)_auto]">
        <label className="space-y-1">
          <span className="text-sm font-medium">Quantity</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            min="1"
            onChange={(event) => onChange(rowIndex, "quantityOrdered", event.target.value)}
            type="number"
            value={line.quantityOrdered}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Unit Price</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            min="0"
            onChange={(event) => onChange(rowIndex, "unitPrice", event.target.value)}
            step="0.01"
            type="number"
            value={line.unitPrice}
          />
        </label>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Line Total</p>
            <p className="mt-1 text-lg font-semibold">${lineTotal}</p>
          </div>
          <button
            className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disableRemove}
            onClick={() => onRemove(rowIndex)}
            type="button"
          >
            Remove
          </button>
        </div>
      </div>

      {selectedSku ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Available stock for {selectedSku.skuCode}: <strong>{selectedSku.available}</strong>
        </div>
      ) : null}
    </div>
  );
}

function DraftEditorSection({
  customers,
  draftEditor,
  onChangeCustomer,
  onChangeField,
  onChangeLine,
  onChangeNotes,
  onRemoveLine,
  skus,
}: {
  customers: Customer[];
  draftEditor: OrderFormState;
  onChangeCustomer: (customerId: string) => void;
  onChangeField: (field: "soNumber" | "subtotalAmount" | "shippingCharge", value: string) => void;
  onChangeLine: (index: number, field: keyof DraftOrderLine, value: string) => void;
  onChangeNotes: (notes: string) => void;
  onRemoveLine: (index: number) => void;
  skus: Sku[];
}) {
  return (
    <div className="mt-3 space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1">
          <span className="text-sm font-medium">Sales Order Number</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            onChange={(event) => onChangeField("soNumber", event.target.value)}
            value={draftEditor.soNumber}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Customer</span>
          <select
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            onChange={(event) => onChangeCustomer(event.target.value)}
            value={draftEditor.customerId}
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.companyName}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Subtotal</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            min="0"
            onChange={(event) => onChangeField("subtotalAmount", event.target.value)}
            step="0.01"
            type="number"
            value={draftEditor.subtotalAmount}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Shipping Charge</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            min="0"
            onChange={(event) => onChangeField("shippingCharge", event.target.value)}
            step="0.01"
            type="number"
            value={draftEditor.shippingCharge}
          />
        </label>
      </div>

      <div className="grid gap-4">
        <label className="space-y-1">
          <span className="text-sm font-medium">Notes</span>
          <textarea
            className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2"
            onChange={(event) => onChangeNotes(event.target.value)}
            value={draftEditor.notes}
          />
        </label>
      </div>

      <div className="space-y-3">
        {draftEditor.lines.map((line, index) => (
          <EditableLineCard
            key={`${line.skuId || "draft"}-${index}`}
            disableRemove={draftEditor.lines.length === 1}
            line={line}
            onChange={onChangeLine}
            onRemove={onRemoveLine}
            rowIndex={index}
            skus={skus}
          />
        ))}
      </div>
    </div>
  );
}

function ReadonlyLinesTable({
  lines,
}: {
  lines: SalesOrderDetail["lines"];
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200">
      <table className="min-w-full divide-y divide-neutral-200">
        <thead className="bg-neutral-50">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <th className="px-4 py-3">SKU</th>
            <th className="px-4 py-3">Quantity</th>
            <th className="px-4 py-3">Unit Price</th>
            <th className="px-4 py-3">Line Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 bg-white text-sm">
          {lines.map((line) => (
            <tr key={line.id}>
              <td className="px-4 py-3">
                <p className="font-medium">{line.skuCode}</p>
                <p className="text-neutral-500">{line.productDescription || line.productName}</p>
              </td>
              <td className="px-4 py-3">{line.quantityOrdered}</td>
              <td className="px-4 py-3">${line.unitPrice}</td>
              <td className="px-4 py-3 font-medium">${line.lineTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
