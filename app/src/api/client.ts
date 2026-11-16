/**
 * Every request to the backend goes through apiFetch().
 *
 * For logged-in requests ({ auth: true }) it adds "Authorization: Bearer <access token>".
 * Access tokens expire after 30 minutes: when the backend answers 401, we get a new
 * access token with the refresh token and retry the request once - the user never
 * notices. If the refresh token has expired too (after 30 days), the user is logged out.
 */
import { tokenStorage } from '@/auth/token-storage';
import { API_URL } from '@/config';

const TIMEOUT_MS = 15000;

/** An error answer from the backend, or status 0 when the server couldn't be reached. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown = null,
  ) {
    super(status === 0 ? 'Network error' : `Server answered ${status}`);
    this.name = 'ApiError';
  }

  get isNetworkError() {
    return this.status === 0;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Send the logged-in user's token (and refresh it if it expired). */
  auth?: boolean;
  /** Send a form with files (e.g. a photo) instead of JSON. */
  form?: FormData;
  /** How long to wait before giving up, in milliseconds. */
  timeoutMs?: number;
};

// Called when the session can't be renewed (refresh token expired or revoked).
let sessionExpiredHandler: (() => void) | null = null;
export function setSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler;
}

async function send(
  path: string,
  method: string,
  body: unknown,
  token: string | null,
  form?: FormData,
  timeoutMs = TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = { Accept: 'application/json' };
  // For a form, the phone sets the Content-Type itself (it includes a "boundary").
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0); // no connection, timeout, server not running...
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

type RefreshResult = { token: string } | 'expired' | 'network';
let refreshInFlight: Promise<RefreshResult> | null = null;

/** Get a new access token. Several requests failing at once share one refresh. */
function refreshAccessToken(): Promise<RefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = (async (): Promise<RefreshResult> => {
      const refresh = await tokenStorage.getRefresh();
      if (!refresh) return 'expired';
      let response: Response;
      try {
        response = await send('/api/auth/refresh/', 'POST', { refresh }, null);
      } catch {
        return 'network'; // offline: keep the tokens and try again later
      }
      if (!response.ok) return 'expired';
      const data = (await readJson(response)) as { access?: string } | null;
      if (!data?.access) return 'expired';
      await tokenStorage.setAccess(data.access);
      return { token: data.access };
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, form, timeoutMs } = options;

  let token = auth ? await tokenStorage.getAccess() : null;
  let response = await send(path, method, body, token, form, timeoutMs);

  if (auth && response.status === 401) {
    const result = await refreshAccessToken();
    if (result === 'network') throw new ApiError(0);
    if (result === 'expired') {
      sessionExpiredHandler?.();
    } else {
      token = result.token;
      response = await send(path, method, body, token, form, timeoutMs);
      if (response.status === 401) sessionExpiredHandler?.();
    }
  }

  const data = await readJson(response);
  if (!response.ok) throw new ApiError(response.status, data);
  return data as T;
}
