import type { z } from 'zod'
import { ApiError } from './errors'
import { apiErrorBodySchema } from './schemas'

export type HttpClientOptions = {
  baseUrl?: string
  fetchImpl?: typeof fetch
}

type RequestOptions<T> = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  query?: Record<string, string>
  body?: unknown
  signal?: AbortSignal
  /** Schema for a successful body. Omit for 204. */
  schema?: z.ZodType<T>
}

export function createHttpClient(options: HttpClientOptions = {}) {
  const baseUrl = options.baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? ''

  async function request<T = void>(opts: RequestOptions<T>): Promise<T> {
    // Absolute URL: jsdom/Node `fetch` does not accept relative paths.
    const url = new URL(baseUrl + opts.path, window.location.origin)
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v)

    let response: Response
    try {
      response = await (options.fetchImpl ?? fetch)(url, {
        method: opts.method,
        headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal,
      })
    } catch (e) {
      if (e instanceof TypeError) {
        throw new ApiError({ status: 0, code: 'NETWORK', message: 'Network error' })
      }
      throw e // AbortError etc.
    }

    if (!response.ok) throw await parseError(response)
    if (response.status === 204 || !opts.schema) return undefined as T

    try {
      return opts.schema.parse(await response.json())
    } catch (e) {
      console.error('Unexpected API response', opts.method, url.pathname, e)
      throw new ApiError({
        status: response.status,
        code: 'INTERNAL',
        message: 'Unexpected response',
      })
    }
  }

  return { request }
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const { error } = apiErrorBodySchema.parse(await response.json())
    return new ApiError({ status: response.status, ...error })
  } catch {
    console.error('Unexpected API error response', response.status, response.url)
    return new ApiError({
      status: response.status,
      code: 'INTERNAL',
      message: 'Unexpected response',
    })
  }
}
