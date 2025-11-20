// src/routes/auth.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../prisma";
import { UserRole } from "@prisma/client";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "changeme-in-env";

// POST /auth/register
// OJO: por ahora lo dejamos abierto para desarrollo.
// Luego lo deberíamos proteger para que solo ADMIN pueda crear usuarios.
router.post("/register", async (req, res) => {
  try {
    const {
      email,
      password,
      role,
      fullName,
      rut,
      workerType,
    } = req.body as {
      email?: string;
      password?: string;
      role?: UserRole;
      fullName?: string;
      rut?: string;
      workerType?: string;
    };

    if (!email || !password || !role) {
      return res.status(400).json({
        message: "email, password y role son obligatorios",
      });
    }

    // Hash de password
    const passwordHash = await bcrypt.hash(password, 10);

    // Opcionalmente creamos Worker si vienen datos
    let workerId: number | undefined;
    if (fullName && rut) {
      const worker = await prisma.worker.create({
        data: {
          fullName,
          rut,
          type: (workerType as any) || "OTRO",
          email,
        },
      });
      workerId = worker.id;
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        workerId,
      },
    });

    return res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      workerId: user.workerId,
    });
  } catch (err: any) {
    console.error("Error en /auth/register", err);
    if (err.code === "P2002") {
      return res.status(409).json({ message: "Email o RUT ya están en uso" });
    }
    return res.status(500).json({ message: "Error al crear usuario" });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ message: "email y password son obligatorios" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    // Si quieres devolver info del Worker asociado:
    const worker = user.workerId
      ? await prisma.worker.findUnique({ where: { id: user.workerId } })
      : null;

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        worker: worker
          ? {
              id: worker.id,
              fullName: worker.fullName,
              rut: worker.rut,
              type: worker.type,
            }
          : null,
      },
    });
  } catch (err) {
    console.error("Error en /auth/login", err);
    return res.status(500).json({ message: "Error al iniciar sesión" });
  }
});

export default router;
