/**
 * Data Migration Script: SQLite → PostgreSQL
 * 
 * This script migrates all data from the SQLite backup to PostgreSQL,
 * respecting foreign key relationships and handling data transformation.
 */

const sqlite3 = require('sqlite3').verbose();
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const prisma = new PrismaClient();

// Path to SQLite backup
const SQLITE_DB_PATH = path.join(__dirname, '..', 'backup', 'dev.db.backup');

// Statistics
const stats = {
    tables: {},
    errors: [],
    startTime: null,
    endTime: null
};

/**
 * Open SQLite database
 */
function openSQLiteDB(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(err);
            } else {
                console.log(`✅ Connected to SQLite: ${dbPath}`);
                resolve(db);
            }
        });
    });
}

/**
 * Query SQLite database
 */
function querySQLite(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

/**
 * Close SQLite database
 */
function closeSQLiteDB(db) {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

/**
 * Reset PostgreSQL sequences after data import
 */
async function resetSequences() {
    console.log('\n📊 Resetting PostgreSQL sequences...');

    const tables = [
        'Categoria',
        'Subcategoria',
        'Proveedor',
        'Bodega',
        'Proyecto',
        'Producto',
        'Ingreso',
        'IngresoItem',
        'StockMovimiento',
        'MovimientoProyecto',
        'MovimientoProyectoItem',
        'DevolucionProveedor',
        'DevolucionProveedorItem',
        'Worker',
        'User'
    ];

    for (const table of tables) {
        try {
            await prisma.$executeRawUnsafe(
                `SELECT setval('"${table}_id_seq"', COALESCE((SELECT MAX(id) FROM "${table}"), 1), true);`
            );
            console.log(`  ✓ ${table}_id_seq reset`);
        } catch (error) {
            console.log(`  ⚠ ${table}_id_seq: ${error.message}`);
        }
    }
}

/**
 * Migrate Categoria table
 */
async function migrateCategorias(db) {
    const tableName = 'Categoria';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM Categoria ORDER BY id');

    for (const row of rows) {
        await prisma.categoria.create({
            data: {
                id: row.id,
                codigo: row.codigo,
                nombre: row.nombre
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate Subcategoria table
 */
async function migrateSubcategorias(db) {
    const tableName = 'Subcategoria';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM Subcategoria ORDER BY id');

    for (const row of rows) {
        await prisma.subcategoria.create({
            data: {
                id: row.id,
                nombre: row.nombre,
                categoriaId: row.categoriaId
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate Proveedor table
 */
async function migrateProveedores(db) {
    const tableName = 'Proveedor';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM Proveedor ORDER BY id');

    for (const row of rows) {
        await prisma.proveedor.create({
            data: {
                id: row.id,
                nombre: row.nombre,
                rut: row.rut,
                email: row.email,
                telefono: row.telefono,
                direccion: row.direccion,
                activo: row.activo === 1
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate Bodega table
 */
async function migrateBodegas(db) {
    const tableName = 'Bodega';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM Bodega ORDER BY id');

    for (const row of rows) {
        await prisma.bodega.create({
            data: {
                id: row.id,
                nombre: row.nombre,
                codigo: row.codigo,
                esPrincipal: row.esPrincipal === 1,
                ubicacion: row.ubicacion
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate Proyecto table
 */
async function migrateProyectos(db) {
    const tableName = 'Proyecto';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM Proyecto ORDER BY id');

    for (const row of rows) {
        await prisma.proyecto.create({
            data: {
                id: row.id,
                nombre: row.nombre,
                codigo: row.codigo,
                descripcion: row.descripcion,
                activo: row.activo === 1,
                creadoEn: new Date(row.creadoEn),
                actualizadoEn: new Date(row.actualizadoEn)
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate Producto table
 */
async function migrateProductos(db) {
    const tableName = 'Producto';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM Producto ORDER BY id');

    for (const row of rows) {
        await prisma.producto.create({
            data: {
                id: row.id,
                sku: row.sku,
                nombre: row.nombre,
                descripcion: row.descripcion,
                categoriaId: row.categoriaId,
                subcategoriaId: row.subcategoriaId,
                proveedorId: row.proveedorId,
                stock: row.stock,
                stockMinimo: row.stockMinimo,
                ubicacion: row.ubicacion,
                codigoBarras: row.codigoBarras,
                imagenUrl: row.imagenUrl,
                creadoEn: new Date(row.creadoEn),
                actualizadoEn: new Date(row.actualizadoEn),
                ppp: row.ppp
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate Worker table
 */
async function migrateWorkers(db) {
    const tableName = 'Worker';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM Worker ORDER BY id');

    for (const row of rows) {
        await prisma.worker.create({
            data: {
                id: row.id,
                fullName: row.fullName,
                rut: row.rut,
                email: row.email,
                phone: row.phone,
                type: row.type,
                isActive: row.isActive === 1,
                createdAt: new Date(row.createdAt),
                updatedAt: new Date(row.updatedAt)
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate User table
 */
async function migrateUsers(db) {
    const tableName = 'User';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM User ORDER BY id');

    for (const row of rows) {
        await prisma.user.create({
            data: {
                id: row.id,
                email: row.email,
                passwordHash: row.passwordHash,
                role: row.role,
                isActive: row.isActive === 1,
                createdAt: new Date(row.createdAt),
                updatedAt: new Date(row.updatedAt),
                workerId: row.workerId
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate Ingreso table
 */
async function migrateIngresos(db) {
    const tableName = 'Ingreso';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM Ingreso ORDER BY id');

    for (const row of rows) {
        await prisma.ingreso.create({
            data: {
                id: row.id,
                fecha: new Date(row.fecha),
                proveedorId: row.proveedorId,
                bodegaId: row.bodegaId,
                tipoDocumento: row.tipoDocumento,
                numeroDocumento: row.numeroDocumento,
                observacion: row.observacion
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate IngresoItem table
 */
async function migrateIngresoItems(db) {
    const tableName = 'IngresoItem';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM IngresoItem ORDER BY id');

    for (const row of rows) {
        await prisma.ingresoItem.create({
            data: {
                id: row.id,
                ingresoId: row.ingresoId,
                productoId: row.productoId,
                cantidad: row.cantidad,
                costoUnitario: row.costoUnitario,
                lote: row.lote,
                venceAt: row.venceAt ? new Date(row.venceAt) : null
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate StockMovimiento table
 */
async function migrateStockMovimientos(db) {
    const tableName = 'StockMovimiento';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM StockMovimiento ORDER BY id');

    for (const row of rows) {
        await prisma.stockMovimiento.create({
            data: {
                id: row.id,
                productoId: row.productoId,
                tipo: row.tipo,
                cantidad: row.cantidad,
                costoUnitario: row.costoUnitario,
                pppAntes: row.pppAntes,
                pppDespues: row.pppDespues,
                refTipo: row.refTipo,
                refId: row.refId,
                createdAt: new Date(row.createdAt)
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate MovimientoProyecto table
 */
async function migrateMovimientosProyecto(db) {
    const tableName = 'MovimientoProyecto';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM MovimientoProyecto ORDER BY id');

    for (const row of rows) {
        await prisma.movimientoProyecto.create({
            data: {
                id: row.id,
                proyectoId: row.proyectoId,
                tipo: row.tipo,
                fecha: new Date(row.fecha),
                bodegaId: row.bodegaId,
                tipoDocumento: row.tipoDocumento,
                numeroDocumento: row.numeroDocumento,
                observacion: row.observacion
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate MovimientoProyectoItem table
 */
async function migrateMovimientoProyectoItems(db) {
    const tableName = 'MovimientoProyectoItem';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM MovimientoProyectoItem ORDER BY id');

    for (const row of rows) {
        await prisma.movimientoProyectoItem.create({
            data: {
                id: row.id,
                movimientoId: row.movimientoId,
                productoId: row.productoId,
                cantidad: row.cantidad,
                costoUnitario: row.costoUnitario
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate DevolucionProveedor table
 */
async function migrateDevoluciones(db) {
    const tableName = 'DevolucionProveedor';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM DevolucionProveedor ORDER BY id');

    for (const row of rows) {
        await prisma.devolucionProveedor.create({
            data: {
                id: row.id,
                fecha: new Date(row.fecha),
                proveedorId: row.proveedorId,
                bodegaId: row.bodegaId,
                tipoDocumento: row.tipoDocumento,
                numeroDocumento: row.numeroDocumento,
                observacion: row.observacion
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Migrate DevolucionProveedorItem table
 */
async function migrateDevolucionItems(db) {
    const tableName = 'DevolucionProveedorItem';
    console.log(`\n📦 Migrating ${tableName}...`);

    const rows = await querySQLite(db, 'SELECT * FROM DevolucionProveedorItem ORDER BY id');

    for (const row of rows) {
        await prisma.devolucionProveedorItem.create({
            data: {
                id: row.id,
                devolucionId: row.devolucionId,
                productoId: row.productoId,
                cantidad: row.cantidad,
                costoUnitario: row.costoUnitario
            }
        });
    }

    stats.tables[tableName] = rows.length;
    console.log(`  ✅ Migrated ${rows.length} rows`);
}

/**
 * Main migration function
 */
async function main() {
    let db;

    try {
        stats.startTime = new Date();

        console.log('🚀 Starting data migration: SQLite → PostgreSQL\n');
        console.log(`📁 SQLite backup: ${SQLITE_DB_PATH}`);
        console.log(`🐘 PostgreSQL database: fire_stock_db\n`);

        // Open SQLite connection
        db = await openSQLiteDB(SQLITE_DB_PATH);

        // Migrate tables in dependency order (respecting foreign keys)
        await migrateCategorias(db);
        await migrateSubcategorias(db);
        await migrateProveedores(db);
        await migrateBodegas(db);
        await migrateProyectos(db);
        await migrateProductos(db);
        await migrateWorkers(db);
        await migrateUsers(db);
        await migrateIngresos(db);
        await migrateIngresoItems(db);
        await migrateStockMovimientos(db);
        await migrateMovimientosProyecto(db);
        await migrateMovimientoProyectoItems(db);
        await migrateDevoluciones(db);
        await migrateDevolucionItems(db);

        // Reset sequences
        await resetSequences();

        stats.endTime = new Date();
        const durationMs = stats.endTime - stats.startTime;
        const durationSec = (durationMs / 1000).toFixed(2);

        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 MIGRATION SUMMARY');
        console.log('='.repeat(60));

        let totalRows = 0;
        for (const [table, count] of Object.entries(stats.tables)) {
            console.log(`  ${table.padEnd(30)} ${count.toString().padStart(6)} rows`);
            totalRows += count;
        }

        console.log('='.repeat(60));
        console.log(`  ${'TOTAL'.padEnd(30)} ${totalRows.toString().padStart(6)} rows`);
        console.log('='.repeat(60));
        console.log(`\n⏱️  Duration: ${durationSec} seconds`);
        console.log('\n✅ Migration completed successfully!\n');

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        stats.errors.push(error);
        process.exit(1);
    } finally {
        // Close connections
        if (db) {
            await closeSQLiteDB(db);
            console.log('✅ SQLite connection closed');
        }

        await prisma.$disconnect();
        console.log('✅ PostgreSQL connection closed');
    }
}

// Run migration
main();
