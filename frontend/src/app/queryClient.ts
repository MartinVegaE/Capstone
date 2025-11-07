// src/app/queryClient.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // 30s
      refetchOnWindowFocus: false, // no refetch al cambiar de pestaña
      retry: 1,                    // reintento sencillo
    },
  },
});
