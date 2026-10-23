import { QueryClient } from '@tanstack/react-query';

/** Server data cache (TanStack Query), per the technical design. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // keep a day for offline snapshots
      staleTime: 1000 * 30,
    },
  },
});
