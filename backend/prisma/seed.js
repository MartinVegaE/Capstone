// prisma/seed.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // 1) Bodega principal
  const bodegaPrincipal = await prisma.bodega.upsert({
    where: { nombre: "Bodega principal" },
    update: {},
    create: {
      nombre: "Bodega principal",
      codigo: "BODEGA_PRINCIPAL",
      esPrincipal: true,
      ubicacion: "Casa matriz",
    },
  });

   // 2) Proveedor especial: Bodega inicial
  const proveedorBodegaInicial = await prisma.proveedor.upsert({
    where: { rut: "BODEGA_INICIAL" }, // usar campo único
    update: {},
    create: {
      nombre: "Bodega inicial",
      rut: "BODEGA_INICIAL",
      email: null,
      telefono: null,
      direccion: null,
    },
  });


  // 3) Categorías y subcategorías
  const categoriasConfig = [
    {
      codigo: "EXT",
      nombre: "Extinción",
      subcategorias: ["Bombas de impulsión", "Fitting", "Sprinkler"],
    },
    {
      codigo: "DET",
      nombre: "Detección",
      subcategorias: ["Sensores", "Centrales", "Tuberías EMT", "Cajas de distribución"],
    },
    {
      codigo: "ACF",
      nombre: "Activo fijo",
      subcategorias: ["Cajones de trabajo", "Herramientas menores", "Escaleras", "Nipleras"],
    },
    {
      codigo: "FUN",
      nombre: "Fungibles",
      subcategorias: ["EPP"],
    },
  ];

  for (const cat of categoriasConfig) {
    const categoria = await prisma.categoria.upsert({
      where: { codigo: cat.codigo },
      update: {
        nombre: cat.nombre,
      },
      create: {
        codigo: cat.codigo,
        nombre: cat.nombre,
      },
    });

    for (const nombreSub of cat.subcategorias) {
      await prisma.subcategoria.upsert({
        // este nombre viene del @@unique([categoriaId, nombre]) del schema
        where: {
          categoriaId_nombre: {
            categoriaId: categoria.id,
            nombre: nombreSub,
          },
        },
        update: {},
        create: {
          nombre: nombreSub,
          categoriaId: categoria.id,
        },
      });
    }
  }

  // 4) Proyectos demo (centros de costo)
  const proyecto1 = await prisma.proyecto.upsert({
    where: { nombre: "Proyecto Demo 1" },
    update: {},
    create: {
      nombre: "Proyecto Demo 1",
      codigo: "P-001",
      activo: true,
    },
  });

  const proyecto2 = await prisma.proyecto.upsert({
    where: { nombre: "Proyecto Demo 2" },
    update: {},
    create: {
      nombre: "Proyecto Demo 2",
      codigo: "P-002",
      activo: true,
    },
  });

  console.log("✅ Seed completado:");
  console.log("  - Bodega principal:", bodegaPrincipal.nombre);
  console.log("  - Proveedor especial:", proveedorBodegaInicial.nombre);
  console.log("  - Proyectos:", proyecto1.nombre, ",", proyecto2.nombre);
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
