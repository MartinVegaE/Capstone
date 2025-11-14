/*
  Warnings:

  - You are about to drop the column `nombre` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `stock_m` on the `Product` table. All the data in the column will be lost.
  - Added the required column `name` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stock" DECIMAL NOT NULL DEFAULT 0,
    "familia" TEXT NOT NULL,
    "subfamilia" TEXT,
    "unidadMedidaBase" TEXT NOT NULL,
    "stockMin" INTEGER NOT NULL DEFAULT 0,
    "ppp" DECIMAL NOT NULL DEFAULT 0,
    "marca" TEXT,
    "modelo" TEXT,
    "norma" TEXT,
    "codigoBarras" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "descripcion" TEXT,
    "specs" JSONB,
    "proveedorId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Product" ("activo", "codigoBarras", "createdAt", "descripcion", "familia", "id", "marca", "modelo", "norma", "ppp", "proveedorId", "sku", "specs", "stockMin", "subfamilia", "unidadMedidaBase", "updatedAt") SELECT "activo", "codigoBarras", "createdAt", "descripcion", "familia", "id", "marca", "modelo", "norma", "ppp", "proveedorId", "sku", "specs", "stockMin", "subfamilia", "unidadMedidaBase", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE UNIQUE INDEX "Product_codigoBarras_key" ON "Product"("codigoBarras");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
