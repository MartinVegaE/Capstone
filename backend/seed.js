const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const data = [
  { sku: "SKU-001", nombre: "Producto A", stock: 10 },
  { sku: "SKU-002", nombre: "Producto B", stock: 5 },
  { sku: "SKU-003", nombre: "Producto C", stock: 0 },
];

async function main() {
  for (const p of data) {
    await prisma.producto.upsert({
      where: { sku: p.sku },
      update: { nombre: p.nombre, stock: p.stock },
      create: p,
    });
  }
  console.log("Seed ok (idempotente por SKU)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
