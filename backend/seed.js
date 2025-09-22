const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  await prisma.producto.createMany({
    data: [
      { sku: "SKU-001", nombre: "Producto A", stock: 10 },
      { sku: "SKU-002", nombre: "Producto B", stock: 5 },
      { sku: "SKU-003", nombre: "Producto C", stock: 0 }
    ],
    skipDuplicates: true
  });
  console.log("Seed ok");
}
main().finally(()=>prisma.$disconnect());
