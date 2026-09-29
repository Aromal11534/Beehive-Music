/**
 * API client for connecting to the Beehive FastAPI backend
 */

const CONFIGURED_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';
const CONFIGURED_WS_BASE = process.env.NEXT_PUBLIC_WS_URL || '/api/v1';
const LOCAL_API_PORT = process.env.NEXT_PUBLIC_LOCAL_API_PORT || '8001';

function isLocalHostname(hostname: string) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.endsWith('.localhost');
}

function localApiAuthority() {
  if (window.location.port === '3000') {
    return `${window.location.hostname}:${LOCAL_API_PORT}`;
  }
  return window.location.host;
}

function normalizeApiBase(base: string) {
  const trimmed = base.replace(/\/$/, '');

  if (typeof window !== 'undefined') {
    if (isLocalHostname(window.location.hostname)) {
      return window.location.port === '3000'
        ? `http://${localApiAuthority()}/api/v1`
        : '/api/v1';
    }

    if (trimmed.startsWith('http')) {
      try {
        if (new URL(trimmed).hostname !== window.location.hostname) {
          return '/api/v1';
        }
      } catch {
        return '/api/v1';
      }
    }
  }

  return trimmed.endsWith('/api') ? `${trimmed}/v1` : trimmed;
}

export function getApiBase() {
  return normalizeApiBase(CONFIGURED_API_BASE);
}

export function getWsBase() {
  const normalized = CONFIGURED_WS_BASE
    .replace(/\/$/, '')
    .replace(/\/ws$/, '/api/v1');

  if (typeof window === 'undefined') return normalized;

  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const sameOriginBase = `${wsProtocol}://${localApiAuthority()}/api/v1`;

  if (isLocalHostname(window.location.hostname)) {
    return sameOriginBase;
  }

  if (normalized.startsWith('ws://') || normalized.startsWith('wss://')) {
    try {
      const configured = new URL(normalized);
      if (configured.hostname !== window.location.hostname) {
        return sameOriginBase;
      }
    } catch {
      return sameOriginBase;
    }

    return window.location.protocol === 'https:'
      ? normalized.replace(/^ws:\/\//, 'wss://')
      : normalized.replace(/^wss:\/\//, 'ws://');
  }

  const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${wsProtocol}://${window.location.host}${path}`;
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  isFormData?: boolean;
}

interface ApiErrorResponse {
  detail?: unknown;
  message?: unknown;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

class ApiClient {
  private refreshPromise: Promise<boolean> | null = null;

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('beehive_access_token');
  }

  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('beehive_refresh_token');
  }

  setTokens(access: string, refresh: string) {
    localStorage.setItem('beehive_access_token', access);
    localStorage.setItem('beehive_refresh_token', refresh);
  }

  clearTokens() {
    localStorage.removeItem('beehive_access_token');
    localStorage.removeItem('beehive_refresh_token');
  }

  async request<T = unknown>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {}, isFormData = false } = options;

    const token = this.getToken();
    const requestHeaders: Record<string, string> = {
      ...headers,
    };

    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }

    if (!isFormData) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    const config: RequestInit = {
      method,
      headers: requestHeaders,
      cache: 'no-store',
    };

    if (body !== undefined) {
      config.body = isFormData ? body as BodyInit : JSON.stringify(body);
    }

    const apiBase = getApiBase();
    let response = await fetch(`${apiBase}${endpoint}`, config);

    // Token expired — try refresh
    if (response.status === 401 && this.getRefreshToken()) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        requestHeaders['Authorization'] = `Bearer ${this.getToken()}`;
        config.headers = requestHeaders;
        response = await fetch(`${apiBase}${endpoint}`, config);
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch((): ApiErrorResponse => ({ detail: 'Unknown error' })) as ApiErrorResponse;
      const detail = errorData.detail ?? errorData.message ?? 'Request failed';
      const message = typeof detail === 'string' ? detail : JSON.stringify(detail);
      throw new ApiError(response.status, message, detail);
    }

    return response.json() as Promise<T>;
  }

  private async refreshTokens(): Promise<boolean> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.performTokenRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  private async performTokenRefresh(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${getApiBase()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (response.ok) {
        const data = await response.json() as TokenResponse;
        this.setTokens(data.access_token, data.refresh_token);
        return true;
      }
    } catch {}

    this.clearTokens();
    return false;
  }

  // Convenience methods
  get<T = unknown>(endpoint: string) { return this.request<T>(endpoint); }
  post<T = unknown>(endpoint: string, body?: unknown) { return this.request<T>(endpoint, { method: 'POST', body }); }
  patch<T = unknown>(endpoint: string, body?: unknown) { return this.request<T>(endpoint, { method: 'PATCH', body }); }
  put<T = unknown>(endpoint: string, body?: unknown) { return this.request<T>(endpoint, { method: 'PUT', body }); }
  delete<T = unknown>(endpoint: string) { return this.request<T>(endpoint, { method: 'DELETE' }); }
  upload<T = unknown>(endpoint: string, formData: FormData) {
    return this.request<T>(endpoint, { method: 'POST', body: formData, isFormData: true });
  }
}

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export const api = new ApiClient();
