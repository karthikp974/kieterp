import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { networkErrorMessage, resolveApiUrl } from "../shared/api-base";
import { AuthContext } from "./auth-context";
import { AuthResponse, AuthUser } from "./auth-types";

const ACCESS_TOKEN_KEY = "erp.accessToken";
const REFRESH_TOKEN_KEY = "erp.refreshToken";

function saveAuth(response: AuthResponse) {
  localStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
}

function clearAuthStorage() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(ACCESS_TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      throw new Error("No refresh token available.");
    }

    const response = await fetch(resolveApiUrl("/api/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });

    if (!response.ok) {
      throw new Error("Session refresh failed.");
    }

    const data = (await response.json()) as AuthResponse;
    saveAuth(data);
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.accessToken;
  }, []);

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = resolveApiUrl(input);
      const token = accessToken ?? localStorage.getItem(ACCESS_TOKEN_KEY);
      const headers = new Headers(init.headers);
      if (init.body instanceof FormData) {
        headers.delete("Content-Type");
      }
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      let response = await fetch(url, { ...init, headers });
      if (response.status !== 401) {
        return response;
      }

      const nextToken = await refresh();
      headers.set("Authorization", `Bearer ${nextToken}`);
      response = await fetch(url, { ...init, headers });
      return response;
    },
    [accessToken, refresh]
  );

  const login = useCallback(async (identifier: string, password: string) => {
    let response: Response;
    try {
      response = await fetch(resolveApiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password })
      });
    } catch (error) {
      throw new Error(networkErrorMessage(error, "Cannot reach the API server."));
    }

    const raw = await response.json().catch(() => null) as { message?: string | string[] } | null;

    if (!response.ok) {
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        throw new Error(
          "API server is not running. From the repo root run `npm run dev`, or start the backend on port 4000."
        );
      }
      const m = raw?.message;
      const text = Array.isArray(m) ? m[0] : m;
      throw new Error(typeof text === "string" && text.trim() ? text : "Invalid login credentials.");
    }

    const data = raw as AuthResponse;
    saveAuth(data);
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const refreshProfile = useCallback(async () => {
    const response = await authFetch("/api/auth/me");
    if (!response.ok) {
      throw new Error("Unable to load profile.");
    }
    const currentUser = (await response.json()) as AuthUser;
    setUser(currentUser);
    return currentUser;
  }, [authFetch]);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    clearAuthStorage();
    setAccessToken(null);
    setUser(null);

    if (refreshToken) {
      await fetch(resolveApiUrl("/api/auth/logout"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken })
      }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        if (!localStorage.getItem(ACCESS_TOKEN_KEY) && !localStorage.getItem(REFRESH_TOKEN_KEY)) {
          return;
        }

        const response = await authFetch("/api/auth/me");
        if (!response.ok) {
          throw new Error("Unable to load current user.");
        }

        const currentUser = (await response.json()) as AuthUser;
        if (active) {
          setUser(currentUser);
        }
      } catch {
        clearAuthStorage();
        if (active) {
          setAccessToken(null);
          setUser(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [authFetch]);

  const value = useMemo(
    () => ({ user, accessToken, isLoading, login, logout, authFetch, refreshProfile }),
    [accessToken, authFetch, isLoading, login, logout, refreshProfile, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
