import axios from "axios";
import type {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from "axios";

const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:4000";

const http: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

http.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("accessToken");

    if (token) {
      const headers = (config.headers ?? {}) as any;
      headers["Authorization"] = `Bearer ${token}`;
      config.headers = headers;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

http.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // aquí podrías manejar logout
    }
    return Promise.reject(error);
  }
);

// Helpers
export async function httpGet<T>(
  url: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await http.get<T>(url, config);
  return response.data;
}

export async function httpPost<T, B = unknown>(
  url: string,
  body?: B,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await http.post<T>(url, body, config);
  return response.data;
}

export async function httpPut<T, B = unknown>(
  url: string,
  body?: B,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await http.put<T>(url, body, config);
  return response.data;
}

export async function httpDelete<T>(
  url: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await http.delete<T>(url, config);
  return response.data;
}

export function isHttpError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error);
}

export function getHttpErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as any;

    if (data?.message && typeof data.message === "string") {
      return data.message;
    }

    if (status === 0 || error.code === "ECONNABORTED") {
      return "No se pudo contactar con el servidor. Intenta nuevamente.";
    }

    if (status === 400) return "Solicitud inválida.";
    if (status === 401) return "No autorizado.";
    if (status === 403) return "Acceso denegado.";
    if (status === 404) return "Recurso no encontrado.";
    if (status && status >= 500)
      return "Error interno del servidor. Intenta más tarde.";

    return "Ocurrió un error al comunicarse con el servidor.";
  }

  return "Ocurrió un error inesperado.";
}

// exports con nombre
export { http };

// ⬇⬇⬇ ESTE ES EL NUEVO
// export default para que import http from "../lib/http" funcione
export default http;
