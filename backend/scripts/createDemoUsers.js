// scripts/createDemoUsers.js
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const adminPass = await bcrypt.hash("fpadmin123", 10);
  const bodegaPass = await bcrypt.hash("fpbodega123", 10);

  await prisma.usuario.upsert({
    where: { email: "admin@fireprevention.cl" },
    update: {},
    create: {
      nombre: "Admin Demo",
      email: "admin@fireprevention.cl",
      rol: "ADMIN",
      passwordHash: adminPass,
    },
  });

  await prisma.usuario.upsert({
    where: { email: "bodega@fireprevention.cl" },
    update: {},
    create: {
      nombre: "Bodega Demo",
      email: "bodega@fireprevention.cl",
      rol: "BODEGA",
      passwordHash: bodegaPass,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
