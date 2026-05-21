"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import { useAuth } from "./use-auth";

type CacheEntry<T = unknown> = {
  data: T;
  storedAt: number;
};

type FetchCacheOptions = {
  ttlMs?: number;
  force?: boolean;
};

type FetchCacheResult<T> = {
  data: T;
  cached: boolean;
  storedAt: number;
};

type DataCacheContextValue = {
  fetchWithCache: <T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: FetchCacheOptions,
  ) => Promise<FetchCacheResult<T>>;
  peek: <T>(key: string) => CacheEntry<T> | null;
  setCached: <T>(key: string, data: T) => void;
  invalidate: (prefix: string) => void;
  clear: () => void;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DataCacheContext = createContext<DataCacheContextValue | null>(null);

export function DataCacheProvider({ children }: { children: ReactNode }) {
  const { sessionUser } = useAuth();
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const userKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const nextUserKey = sessionUser?.uid ?? null;
    if (userKeyRef.current !== nextUserKey) {
      cacheRef.current.clear();
      userKeyRef.current = nextUserKey;
    }
  }, [sessionUser?.uid]);

  const peek = useCallback(<T,>(key: string): CacheEntry<T> | null => {
    return (cacheRef.current.get(key) as CacheEntry<T> | undefined) ?? null;
  }, []);

  const setCached = useCallback(<T,>(key: string, data: T) => {
    cacheRef.current.set(key, { data, storedAt: Date.now() });
  }, []);

  const invalidate = useCallback((prefix: string) => {
    for (const key of cacheRef.current.keys()) {
      if (key.startsWith(prefix)) {
        cacheRef.current.delete(key);
      }
    }
  }, []);

  const clear = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  const fetchWithCache = useCallback(async <T,>(
    key: string,
    fetcher: () => Promise<T>,
    options: FetchCacheOptions = {},
  ): Promise<FetchCacheResult<T>> => {
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const cached = cacheRef.current.get(key) as CacheEntry<T> | undefined;
    const now = Date.now();

    if (!options.force && cached && now - cached.storedAt <= ttlMs) {
      return { data: cached.data, cached: true, storedAt: cached.storedAt };
    }

    const data = await fetcher();
    cacheRef.current.set(key, { data, storedAt: now });
    return { data, cached: false, storedAt: now };
  }, []);

  const value = useMemo<DataCacheContextValue>(() => ({
    fetchWithCache,
    peek,
    setCached,
    invalidate,
    clear,
  }), [clear, fetchWithCache, invalidate, peek, setCached]);

  return (
    <DataCacheContext.Provider value={value}>
      {children}
    </DataCacheContext.Provider>
  );
}

export function useDataCache() {
  const context = useContext(DataCacheContext);
  if (!context) {
    throw new Error("useDataCache must be used within DataCacheProvider");
  }
  return context;
}
