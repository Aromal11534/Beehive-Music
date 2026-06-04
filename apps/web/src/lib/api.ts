/**
 * API client for connecting to the Beehive FastAPI backend
 */

const CONFIGURED_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';

function normalizeApiBase(base: string) {
  if (typeof window !== 'undefined') {
    const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const configuredHost = base.startsWith('http') ? new URL(base).hostname : window.location.hostname;

    if (isLocalHost || configuredHost !== window.location.hostname) {
      return window.location.port === '3000' ? `http://${window.location.hostname}:8001/api/v1` : '/api/v1';
    }
  }

  const trimmed = base.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? `${trimmed}/v1` : trimmed;
}

export function getApiBase() {
  return normalizeApiBase(CONFIGURED_API_BASE);
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
