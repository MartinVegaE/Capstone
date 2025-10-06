-- CreateTable
CREATE TABLE "Ingreso" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proveedor" TEXT,
    "documento" TEXT,
    "observacion" TEXT
);

-- CreateTable
CREATE TABLE "IngresoItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ingresoId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costoUnitario" DECIMAL NOT NULL,
    "lote" TEXT,
    "venceAt" DATETIME,
    CONSTRAINT "IngresoItem_ingresoId_fkey" FOREIGN KEY ("ingresoId") REFERENCES "Ingreso" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IngresoItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockMovimiento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costoUnitario" DECIMAL,
    "pppAntes" DECIMAL NOT NULL,
    "pppDespues" DECIMAL NOT NULL,
    "refTipo" TEXT NOT NULL,
    "refId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovimiento_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Producto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "marca" TEXT,
    "categoria" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "ubicacion" TEXT,
    "codigoBarras" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    "ppp" DECIMAL NOT NULL DEFAULT 0
);
INSERT INTO "new_Producto" ("actualizadoEn", "categoria", "codigoBarras", "creadoEn", "id", "marca", "nombre", "sku", "stock", "ubicacion") SELECT "actualizadoEn", "categoria", "codigoBarras", "creadoEn", "id", "marca", "nombre", "sku", "stock", "ubicacion" FROM "Producto";
DROP TABLE "Producto";
ALTER TABLE "new_Producto" RENAME TO "Producto";
CREATE UNIQUE INDEX "Producto_sku_key" ON "Producto"("sku");
CREATE UNIQUE INDEX "Producto_codigoBarras_key" ON "Producto"("codigoBarras");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
