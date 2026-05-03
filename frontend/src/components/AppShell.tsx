import { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearAuthSession, getAuthSession } from "@/lib/auth";
import { canCreateSalesOrders, canViewCustomers } from "@/lib/permissions";

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
};

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(() => getAuthSession());
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const sync = () => setSession(getAuthSession());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const navGroups: Array<{ label: string; links: NavItem[] }> = useMemo(
    () => [
      {
        label: "Overview",
        links: [{ to: "/", label: "Dashboard", end: true }],
      },
      {
        label: "Orders",
        links: [
          ...(canCreateSalesOrders(session.user.role) ? [{ to: "/sales/orders/new", label: "Add Order" }] : []),
          { to: "/sales/orders", label: "Existing Orders" },
        ],
      },
      ...(canViewCustomers(session.user.role)
        ? [
            {
              label: "Customers",
              links: [
                { to: "/sales/customers/new", label: "Add Customer" },
                { to: "/sales/customers", label: "Existing Customers" },
              ],
            },
          ]
        : []),
      {
        label: "Inventory",
        links: [
          { to: "/inventory/stock-overview", label: "Stock Overview" },
          { to: "/inventory/actions", label: "Inventory Actions" },
          { to: "/inventory/pallet-locations", label: "Pallet Locations" },
        ],
      },
      ...(session.user.role === "ADMIN" || session.user.role === "MANAGER"
        ? [
            {
              label: "Records",
              links: [{ to: "/inventory/activity-log", label: "Activity Log" }],
            },
          ]
        : []),
      ...(session.user.role === "ADMIN"
        ? [
            {
              label: "Admin",
              links: [{ to: "/admin/users", label: "User Management" }],
            },
          ]
        : []),
    ],
    [session.user.role],
  );

  function closeMenus() {
    setOpenGroup(null);
    setMobileMenuOpen(false);
  }

  function groupIsActive(group: { links: NavItem[] }) {
    return group.links.some((link) => (link.end ? location.pathname === link.to : location.pathname.startsWith(link.to)));
  }

  return (
    <div className="min-h-screen bg-[#f5f7f4] text-neutral-800">
      <header className="border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="shrink-0">
                <h1 className="text-lg font-semibold">GT Orders & Stocks</h1>
                <p className="text-sm text-neutral-500">Sales order and inventory operations workspace</p>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <button
                  className="rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 sm:hidden"
                  onClick={() => setMobileMenuOpen((current) => !current)}
                  type="button"
                >
                  {mobileMenuOpen ? "Close Menu" : "Open Menu"}
                </button>
                <div className="flex items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm">
                  <span className="whitespace-nowrap font-medium text-neutral-800">{session.user.name ?? session.user.email}</span>
                  <span
                    className={[
                      "rounded-full border px-2.5 py-1 text-[11px] leading-none font-semibold uppercase tracking-wide",
                      session.user.role === "ADMIN"
                        ? "border-green-200 bg-green-50 text-green-700"
                        : session.user.role === "MANAGER"
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-amber-200 bg-amber-50 text-amber-700",
                    ].join(" ")}
                  >
                    {session.user.role}
                  </span>
                </div>
                <button
                  className="rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-100"
                  onClick={() => {
                    clearAuthSession();
                    setSession(null);
                    navigate("/login", { replace: true });
                  }}
                  type="button"
                >
                  Sign Out
                </button>
              </div>
            </div>

            <nav className="hidden flex-wrap items-center gap-3 sm:flex">
              {navGroups.map((group) => {
                const isActiveGroup = groupIsActive(group);

                return (
                  <div key={group.label} className="relative">
                    <button
                      aria-expanded={openGroup === group.label}
                      aria-haspopup="menu"
                      className={[
                        "flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-200",
                        openGroup === group.label || isActiveGroup
                          ? "border-green-200 bg-green-50 text-green-800"
                          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50",
                      ].join(" ")}
                      onClick={() => setOpenGroup((current) => (current === group.label ? null : group.label))}
                      type="button"
                    >
                      {group.label}
                      <span className="text-xs text-neutral-400">▾</span>
                    </button>

                    {openGroup === group.label ? (
                      <div className="absolute left-0 top-full z-20 mt-2 min-w-[260px] rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
                        <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                          {group.label}
                        </div>
                        <div className="flex flex-col gap-1">
                          {group.links.map((link) => (
                            <NavDropdownLink key={link.to} link={link} onClick={closeMenus} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          </div>

          {mobileMenuOpen ? (
            <nav className="mt-4 sm:hidden">
              <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                {navGroups.map((group) => (
                  <div key={group.label}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">{group.label}</p>
                    <div className="mt-2 flex flex-col gap-1">
                      {group.links.map((link) => (
                        <NavDropdownLink key={link.to} link={link} onClick={closeMenus} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </nav>
          ) : null}
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-6">
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavDropdownLink({ link, onClick }: { link: NavItem; onClick: () => void }) {
  return (
    <NavLink
      to={link.to}
      end={link.end}
      className={({ isActive }) =>
        [
          "flex items-center justify-between gap-4 rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-200",
          isActive ? "bg-green-50 text-green-800" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
        ].join(" ")
      }
      onClick={onClick}
    >
      {({ isActive }) => (
        <>
          <span>{link.label}</span>
          <span
            className={[
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none",
              isActive ? "border-green-200 bg-white text-green-700" : "border-neutral-200 bg-white text-neutral-500",
            ].join(" ")}
          >
            Open
          </span>
        </>
      )}
    </NavLink>
  );
}
