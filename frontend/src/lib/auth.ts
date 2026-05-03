export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  role: "ADMIN" | "MANAGER" | "WAREHOUSE";
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

const AUTH_STORAGE_KEY = "gt-orders-stocks-auth";

export function getAuthSession(): AuthSession | null {
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function setAuthSession(session: AuthSession) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function hasAuthSession() {
  return Boolean(getAuthSession()?.token);
}
