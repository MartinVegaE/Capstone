// src/api/auth.ts
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

// Deben coincidir con los enums del backend (schema.prisma)
export type UserRole = "ADMIN" | "WAREHOUSE" | "DRIVER" | "SUPERVISOR";
export type WorkerType =
  | "MAESTRO"
  | "BODEGUERO"
  | "CHOFER"
  | "ADMINISTRATIVO"
  | "OTRO";

export interface WorkerDTO {
  id: number;
  fullName: string;
  rut: string;
  type: WorkerType;
}

export interface AuthUserDTO {
  id: number;
  email: string;
  role: UserRole;
  worker: WorkerDTO | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUserDTO;
}

export async function loginApi(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    let message = "Error al iniciar sesión";
    try {
      const data = (await res.json()) as any;
      if (data?.message) message = data.message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  return (await res.json()) as LoginResponse;
}

// Opcional: registrar usuario desde frontend (seguramente lo usará solo ADMIN)
// La dejo preparada por si la quieres usar después.
export async function registerApi(body: {
  email: string;
  password: string;
  role: UserRole;
  fullName?: string;
  rut?: string;
  workerType?: WorkerType;
}) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = "Error al crear usuario";
    try {
      const data = (await res.json()) as any;
      if (data?.message) message = data.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}
