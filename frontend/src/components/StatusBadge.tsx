type StatusBadgeProps = {
  children: string;
};

const statusMap: Record<string, string> = {
  DRAFT: "bg-neutral-100 text-neutral-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  SHIPPED: "bg-green-100 text-green-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-neutral-100 text-neutral-700",
  DISCONTINUED: "bg-red-100 text-red-700",
  RELEASED: "bg-emerald-100 text-emerald-700",
};

export function StatusBadge({ children }: StatusBadgeProps) {
  return (
    <span
      className={[
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        statusMap[children] ?? "bg-neutral-100 text-neutral-700",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

