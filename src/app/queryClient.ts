import { QueryClient } from '@tanstack/react-query'

export type QueryClientOptions = {
  /** Refetch on tab visibility (SPEC D12). `'always'` also refetches fresh data. */
  refetchOnFocus?: boolean
  /** Delay before the single GET retry. */
  retryDelayMs?: number
}

export function createQueryClient({
  refetchOnFocus = true,
  retryDelayMs = 400,
}: QueryClientOptions = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: 1, // A3: GET is retried once
        retryDelay: retryDelayMs,
        refetchOnWindowFocus: refetchOnFocus ? 'always' : false,
      },
      mutations: { retry: 0 }, // A3: mutations are never retried
    },
  })
}

export function setRefetchOnFocus(client: QueryClient, enabled: boolean) {
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: {
      ...client.getDefaultOptions().queries,
      refetchOnWindowFocus: enabled ? 'always' : false,
    },
  })
  // Observers resolved their options earlier: push the new default into the active ones.
  for (const query of client.getQueryCache().getAll()) {
    query.observers.forEach((o) =>
      o.setOptions({ ...o.options, refetchOnWindowFocus: enabled ? 'always' : false }),
    )
  }
}
