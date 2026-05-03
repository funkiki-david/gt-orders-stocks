import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { UserAccount } from "@/lib/types";
import { AccessDeniedPanel } from "@/components/AccessDeniedPanel";
import { getCurrentRole } from "@/lib/permissions";

type UsersResponse = {
  items: UserAccount[];
};

type UserFormState = {
  email: string;
  name: string;
  role: UserAccount["role"];
};

const DEFAULT_PASSWORD = "admin123";

export function UserManagementPage() {
  const role = getCurrentRole();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [createForm, setCreateForm] = useState<UserFormState>({
    email: "",
    name: "",
    role: "MANAGER",
  });
  const [editorForm, setEditorForm] = useState<Pick<UserAccount, "name" | "role" | "active"> | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<UsersResponse>("/users"),
    enabled: role === "ADMIN",
  });

  const users = usersQuery.data?.items ?? [];
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  useEffect(() => {
    if (!selectedUserId && users.length) {
      setSelectedUserId(users[0].id);
    }
  }, [selectedUserId, users]);

  useEffect(() => {
    if (!selectedUser) {
      setEditorForm(null);
      return;
    }

    setEditorForm({
      name: selectedUser.name,
      role: selectedUser.role,
      active: selectedUser.active,
    });
  }, [selectedUser]);

  const createUserMutation = useMutation({
    mutationFn: async () =>
      apiFetch<UserAccount>("/users", {
        method: "POST",
        body: JSON.stringify({
          ...createForm,
          password: DEFAULT_PASSWORD,
        }),
      }),
    onSuccess: async (user) => {
      setError("");
      setNotice(`Created ${user.email} with default password ${DEFAULT_PASSWORD}.`);
      setCreateForm({ email: "", name: "", role: "MANAGER" });
      setSelectedUserId(user.id);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (mutationError) => {
      setNotice("");
      setError(mutationError instanceof Error ? mutationError.message : "Could not create user");
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (userId: string) =>
      apiFetch<UserAccount>(`/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify(editorForm),
      }),
    onSuccess: async (user) => {
      setError("");
      setNotice(`Updated ${user.email}.`);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (mutationError) => {
      setNotice("");
      setError(mutationError instanceof Error ? mutationError.message : "Could not update user");
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) =>
      apiFetch<{ ok: true }>(`/users/${userId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: DEFAULT_PASSWORD }),
      }),
    onSuccess: async () => {
      setError("");
      setNotice(`Password reset to ${DEFAULT_PASSWORD}.`);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (mutationError) => {
      setNotice("");
      setError(mutationError instanceof Error ? mutationError.message : "Could not reset password");
    },
  });

  function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createUserMutation.mutate();
  }

  if (role !== "ADMIN") {
    return <AccessDeniedPanel message="Only Admin users can manage user accounts and role assignments." />;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">User Management</h2>
          <p className="text-sm text-neutral-500">
            Admin-only workspace for assigning roles and resetting demo credentials across Admin, Manager, and Warehouse accounts.
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          Default password for all managed users: <span className="font-semibold text-neutral-900">{DEFAULT_PASSWORD}</span>
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.25fr]">
        <div className="space-y-6">
          <form className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5" onSubmit={handleCreateUser}>
            <div>
              <h3 className="text-lg font-semibold">Create User</h3>
              <p className="text-sm text-neutral-500">New accounts are created with the shared password {DEFAULT_PASSWORD}.</p>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Email</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                value={createForm.email}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Name</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                value={createForm.name}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Role</span>
              <select
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, role: event.target.value as UserAccount["role"] }))
                }
                value={createForm.role}
              >
                <option value="ADMIN">Admin</option>
                <option value="MANAGER">Manager</option>
                <option value="WAREHOUSE">Warehouse</option>
              </select>
            </label>
            <button
              className="rounded-md bg-brand-primary px-4 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-60"
              disabled={createUserMutation.isPending}
              type="submit"
            >
              {createUserMutation.isPending ? "Creating..." : "Create User"}
            </button>
          </form>

          <div className="rounded-xl border border-neutral-200">
            <div className="border-b border-neutral-200 px-5 py-4">
              <h3 className="text-lg font-semibold">User Directory</h3>
              <p className="text-sm text-neutral-500">{users.length} accounts in this workspace.</p>
            </div>
            <div className="divide-y divide-neutral-200">
              {users.map((user) => (
                <button
                  key={user.id}
                  className={[
                    "w-full px-5 py-4 text-left transition-all hover:bg-neutral-50 hover:shadow-sm",
                    selectedUserId === user.id
                      ? "bg-[linear-gradient(135deg,#f3faf3_0%,#e8f4e8_100%)] ring-1 ring-inset ring-green-200"
                      : "bg-white",
                  ].join(" ")}
                  onClick={() => setSelectedUserId(user.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{user.name}</p>
                      <p className="mt-1 text-sm text-neutral-500">{user.email}</p>
                    </div>
                    <span
                      className={[
                        "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        user.role === "ADMIN"
                          ? "border-green-200 bg-green-50 text-green-700"
                          : user.role === "MANAGER"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-amber-200 bg-amber-50 text-amber-700",
                      ].join(" ")}
                    >
                      {user.role}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-neutral-500">{user.active ? "Active" : "Inactive"}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {selectedUser && editorForm ? (
            <div className="space-y-6 rounded-xl border border-neutral-200 p-5">
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-[linear-gradient(135deg,#f8faf7_0%,#eef4ec_100%)] px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Account Record</p>
                <h3 className="mt-2 text-2xl font-semibold">{selectedUser.name}</h3>
                <p className="mt-2 text-sm text-neutral-600">{selectedUser.email}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard label="Role" value={selectedUser.role} />
                <MetricCard label="Status" value={selectedUser.active ? "Active" : "Inactive"} />
                <MetricCard label="Updated" value={new Date(selectedUser.updatedAt).toLocaleDateString()} />
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-5">
                <div>
                  <h4 className="text-base font-semibold">Role Assignment</h4>
                  <p className="text-sm text-neutral-500">Adjust the assigned role and account state for this user.</p>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-medium">Name</span>
                    <input
                      className="w-full rounded-md border border-neutral-300 px-3 py-2"
                      onChange={(event) =>
                        setEditorForm((current) => (current ? { ...current, name: event.target.value } : current))
                      }
                      value={editorForm.name}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium">Assigned Role</span>
                    <select
                      className="w-full rounded-md border border-neutral-300 px-3 py-2"
                      onChange={(event) =>
                        setEditorForm((current) =>
                          current ? { ...current, role: event.target.value as UserAccount["role"] } : current,
                        )
                      }
                      value={editorForm.role}
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="MANAGER">Manager</option>
                      <option value="WAREHOUSE">Warehouse</option>
                    </select>
                  </label>
                </div>
                <label className="mt-4 flex items-center gap-3">
                  <input
                    checked={editorForm.active}
                    onChange={(event) =>
                      setEditorForm((current) => (current ? { ...current, active: event.target.checked } : current))
                    }
                    type="checkbox"
                  />
                  <span className="text-sm font-medium">Account is active</span>
                </label>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    disabled={updateUserMutation.isPending}
                    onClick={() => updateUserMutation.mutate(selectedUser.id)}
                    type="button"
                  >
                    {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                    disabled={resetPasswordMutation.isPending}
                    onClick={() => resetPasswordMutation.mutate(selectedUser.id)}
                    type="button"
                  >
                    {resetPasswordMutation.isPending ? "Resetting..." : `Reset Password to ${DEFAULT_PASSWORD}`}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500">
              Select a user to update role assignment or reset the password.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-neutral-800">{value}</p>
    </div>
  );
}
