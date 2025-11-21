// src/app/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

type UserRole = "ADMIN" | "BODEGA"; // los roles que realmente usas hoy

export interface User {
  email: string;
  role: UserRole;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "fp-auth";

// misma base que el resto de tus hooks de API
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Cargar sesión guardada desde localStorage al montar
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as User;
        setUser(parsed);
      }
    } catch (e) {
      console.error("[Auth] Error leyendo sesión de localStorage:", e);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Login contra el backend real
  async function login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      let msg = "Credenciales inválidas";
      try {
        const data = await res.json();
        if (data?.error) msg = data.error;
      } catch {
        // ignoramos errores al parsear el JSON
      }
      throw new Error(msg);
    }

    // Esperamos un JSON de la forma: { email: string, role: string }
    const data = await res.json();

    const loggedUser: User = {
      email: data.email,
      role: (data.role ?? "BODEGA") as UserRole,
    };

    setUser(loggedUser);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedUser));
  }

  function logout() {
    setUser(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }
  return ctx;
}
