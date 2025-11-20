// src/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "changeme-in-env";

// Lo que guardaremos en req.user
export interface AuthUser {
  id: number;
  role: UserRole;
}

// Extendemos el tipo de Request de Express
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Request {
      user?: AuthUser;
    }
  }
}

// Middleware que valida el token y rellena req.user
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No autenticado" });
  }

  const token = auth.slice("Bearer ".length);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // jwt.verify puede devolver string o JwtPayload -> validamos en runtime
    if (typeof decoded !== "object" || decoded === null) {
      return res.status(401).json({ message: "Token inválido" });
    }

    const sub = (decoded as any).sub;
    const role = (decoded as any).role as UserRole | undefined;

    if (typeof sub !== "number" || !role) {
      return res.status(401).json({ message: "Token inválido" });
    }

    req.user = { id: sub, role };
    return next();
  } catch (err) {
    console.error("Error verificando JWT:", err);
    return res.status(401).json({ message: "Token inválido" });
  }
}

// Middleware para exigir uno o más roles
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Sin permisos" });
    }
    return next();
  };
}
