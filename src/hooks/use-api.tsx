"use client";

import { useCallback } from "react";
import { useAuth } from "./use-auth";

type ApiOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

export function useApi() {
  const { getToken } = useAuth();

  const apiFetch = useCallback(
    async <T = unknown>(path: string, init?: ApiOptions): Promise<T> => {
      const token = await getToken();
      const isFormData = init?.body instanceof FormData;

      const response = await fetch(path, {
        ...init,
        headers: {
          ...(!isFormData ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });

      const payload = await response.json();

      if (!response.ok) {
        const msg = payload.error ?? payload.message ?? `Error ${response.status}`;
        throw new ApiError(msg, response.status, payload);
      }

      return payload as T;
    },
    [getToken],
  );

  const get = useCallback(
    <T = unknown>(path: string) => apiFetch<T>(path, { method: "GET" }),
    [apiFetch],
  );

  const post = useCallback(
    <T = unknown>(path: string, body: unknown) =>
      apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
    [apiFetch],
  );

  const patch = useCallback(
    <T = unknown>(path: string, body: unknown) =>
      apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
    [apiFetch],
  );

  const del = useCallback(
    <T = unknown>(path: string, body?: unknown) =>
      apiFetch<T>(path, {
        method: "DELETE",
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    [apiFetch],
  );

  const upload = useCallback(
    <T = unknown>(path: string, body: FormData) =>
      apiFetch<T>(path, { method: "POST", body }),
    [apiFetch],
  );

  return { apiFetch, get, post, patch, del, upload };
}

/* ─── Custom Error ─── */
export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}
