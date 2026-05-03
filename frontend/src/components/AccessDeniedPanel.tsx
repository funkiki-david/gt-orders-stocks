export function AccessDeniedPanel({
  title = "Access Restricted",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-3 text-sm text-neutral-500">{message}</p>
    </div>
  );
}
