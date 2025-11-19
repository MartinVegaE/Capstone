import { Router } from "express";
import prisma from "../prisma";

const router = Router();

// Helper para parsear números opcionales
function toOptionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

// GET /productos?search=...&onlyActive=true
router.get("/", async (req, res) => {
  try {
    const { search, onlyActive } = req.query;

    const where: any = {};

    if (search && typeof search === "string" && search.trim() !== "") {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
      ];
    }

    if (onlyActive === "true") {
      where.isActive = true;
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
    });

    res.json(products);
  } catch (error) {
    console.error("Error GET /productos:", error);
    res.status(500).json({ message: "Error al listar productos" });
  }
});

// GET /productos/:id
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    res.json(product);
  } catch (error) {
    console.error("Error GET /productos/:id:", error);
    res.status(500).json({ message: "Error al obtener el producto" });
  }
});

// POST /productos
router.post("/", async (req, res) => {
  try {
    const {
      code,
      name,
      description,
      unit,
      kind,
      isActive,
      minStock,
      maxStock,
      categoryId,
    } = req.body;

    // Validaciones mínimas
    if (!code || typeof code !== "string") {
      return res.status(400).json({ message: "El código es obligatorio" });
    }

    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }

    if (!unit || typeof unit !== "string") {
      return res.status(400).json({ message: "La unidad es obligatoria" });
    }

    let normalizedKind: "CONSUMABLE" | "TOOL" | "FIXED_ASSET" = "CONSUMABLE";
    if (kind && typeof kind === "string") {
      const upper = kind.toUpperCase();
      if (upper === "CONSUMABLE" || upper === "TOOL" || upper === "FIXED_ASSET") {
        normalizedKind = upper as typeof normalizedKind;
      } else {
        return res.status(400).json({
          message:
            "Tipo de producto inválido. Use CONSUMABLE, TOOL o FIXED_ASSET.",
        });
      }
    }

    const minStockNum = toOptionalNumber(minStock);
    const maxStockNum = toOptionalNumber(maxStock);

    const newProduct = await prisma.product.create({
      data: {
        code,
        name,
        description: description ?? null,
        unit,
        kind: normalizedKind,
        isActive: typeof isActive === "boolean" ? isActive : true,
        minStock: minStockNum ?? undefined,
        maxStock: maxStockNum ?? undefined,
        categoryId: categoryId ?? null,
      },
    });

    res.status(201).json(newProduct);
  } catch (error: any) {
    console.error("Error POST /productos:", error);

    if (error.code === "P2002") {
      // Prisma unique violation
      return res.status(409).json({
        message: "Ya existe un producto con ese código",
      });
    }

    res.status(500).json({ message: "Error al crear el producto" });
  }
});

// PUT /productos/:id
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const {
      code,
      name,
      description,
      unit,
      kind,
      isActive,
      minStock,
      maxStock,
      categoryId,
    } = req.body;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    let normalizedKind = existing.kind;
    if (kind && typeof kind === "string") {
      const upper = kind.toUpperCase();
      if (upper === "CONSUMABLE" || upper === "TOOL" || upper === "FIXED_ASSET") {
        normalizedKind = upper as typeof normalizedKind;
      } else {
        return res.status(400).json({
          message:
            "Tipo de producto inválido. Use CONSUMABLE, TOOL o FIXED_ASSET.",
        });
      }
    }

    const minStockNum = toOptionalNumber(minStock);
    const maxStockNum = toOptionalNumber(maxStock);

    const updated = await prisma.product.update({
      where: { id },
      data: {
        code: code ?? existing.code,
        name: name ?? existing.name,
        description: description ?? existing.description,
        unit: unit ?? existing.unit,
        kind: normalizedKind,
        isActive:
          typeof isActive === "boolean" ? isActive : existing.isActive,
        minStock: minStockNum ?? existing.minStock,
        maxStock: maxStockNum ?? existing.maxStock,
        categoryId:
          categoryId !== undefined ? categoryId : existing.categoryId,
      },
    });

    res.json(updated);
  } catch (error: any) {
    console.error("Error PUT /productos/:id:", error);

    if (error.code === "P2002") {
      return res.status(409).json({
        message: "Ya existe un producto con ese código",
      });
    }

    res.status(500).json({ message: "Error al actualizar el producto" });
  }
});

// DELETE /productos/:id  (baja lógica: isActive = false)
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        isActive: false,
      },
    });

    res.json({
      message: "Producto dado de baja correctamente",
      product: updated,
    });
  } catch (error) {
    console.error("Error DELETE /productos/:id:", error);
    res.status(500).json({ message: "Error al eliminar el producto" });
  }
});

export default router;
