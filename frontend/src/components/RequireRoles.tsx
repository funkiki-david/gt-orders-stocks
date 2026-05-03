import { AccessDeniedPanel } from "@/components/AccessDeniedPanel";
import { getCurrentRole, type AppRole } from "@/lib/permissions";

export function RequireRoles({
  allowedRoles,
  message,
  children,
}: {
  allowedRoles: AppRole[];
  message: string;
  children: React.ReactNode;
}) {
  const role = getCurrentRole();

  if (!role || !allowedRoles.includes(role)) {
    return <AccessDeniedPanel message={message} />;
  }

  return <>{children}</>;
}
