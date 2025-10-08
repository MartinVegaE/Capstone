-- CreateTable
CREATE TABLE "MovimientoProyecto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "proyecto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documento" TEXT,
    "observacion" TEXT
);

-- CreateTable
CREATE TABLE "MovimientoProyectoItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "movimientoId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costoUnitario" DECIMAL,
    CONSTRAINT "MovimientoProyectoItem_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "MovimientoProyecto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MovimientoProyectoItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
