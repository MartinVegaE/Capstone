// frontend/src/api.ts
import axios from "axios";

// Usa VITE_API_URL si existe; si no, fallback a localhost:4000
const BASE = import.meta.env.VITE_API_URL?.trim() || "http://localhost:4000";

export const api = axios.create({
  baseURL: BASE,
  withCredentials: false,
});

// (Opcional) ayuda en desarrollo
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.log("[api] baseURL =", api.defaults.baseURL);
}
