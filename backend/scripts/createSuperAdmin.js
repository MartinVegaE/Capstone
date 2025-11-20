// backend/scripts/createSuperAdmin.js
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function main() {
  // ⚠️ CREDENCIALES DEL SUPER ADMIN
  const email = "admin@fireprevention.cl";
  const password = "Admin1234!"; // cámbiala si quieres

  // Buscar si ya existe ese usuario
  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    console.log("Ya existe un usuario con ese email, no hago nada.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: "ADMIN",   // según tu enum Role
      // opcional, si lo quieres forzar:
      // isActive: true,
    },
  });

  console.log("✅ Super admin creado correctamente:");
  console.log(`   email:    ${email}`);
  console.log(`   password: ${password}`);
  console.log("ID en BD:", user.id);
}

main()
  .catch((e) => {
    console.error("❌ Error creando super admin:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
