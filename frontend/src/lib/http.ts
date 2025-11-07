// src/lib/http.ts
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

/** Lee el token de acceso guardado (localStorage o lo que uses) */
function getAccessToken(): string | null {
  return localStorage.getItem("token");
}

/** Guarda el token nuevo tras el refresh */
function setAccessToken(token: string | null) {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

/** Instancia base */
const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL, // ej: http://localhost:4000
  withCredentials: true,                 // incluye cookies para /auth/refresh si aplica
  timeout: 20000,
});

/** Interceptor de request: agrega Authorization si hay token */
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Mecanismo de refresh sencillo para 401 */
let refreshingPromise: Promise<string | null> | null = null;

async function refreshToken(): Promise<string | null> {
  // Evita disparar varios refresh a la vez
  if (!refreshingPromise) {
    refreshingPromise = fetch(`${import.meta.env.VITE_API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (r) => (r.ok ? (await r.json())?.accessToken ?? null : null))
      .finally(() => {
        const t = refreshingPromise;
        // pequeño retraso para que otros retries cuelguen del mismo promise
        setTimeout(() => {
          if (refreshingPromise === t) refreshingPromise = null;
        }, 0);
      });
  }
  return refreshingPromise;
}

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as any;

    // Reintenta una sola vez tras refresh
    if (status === 401 && !original?.__isRetry) {
      original.__isRetry = true;
      const newToken = await refreshToken();
      if (newToken) {
        setAccessToken(newToken);
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return http(original);
      } else {
        // token inválido/expirado definitivamente
        setAccessToken(null);
      }
    }

    // Propaga el error
    return Promise.reject(error);
  }
);

export default http;
