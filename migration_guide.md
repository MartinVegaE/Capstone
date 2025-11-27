# SQLite to PostgreSQL Migration Guide

Complete step-by-step guide for migrating your Capstone project from SQLite to PostgreSQL.

---

## Prerequisites

Before starting the migration, ensure you have:
- PostgreSQL installed locally or access to a PostgreSQL server
- Backup of your current SQLite database
- Node.js and npm installed

---

## Step 1: Install PostgreSQL

### Windows Installation

1. **Download PostgreSQL**
   - Visit [PostgreSQL Downloads](https://www.postgresql.org/download/windows/)
   - Download the installer for Windows
   - Run the installer and follow the setup wizard

2. **During Installation**
   - Set a password for the `postgres` superuser (remember this!)
   - Default port: `5432`
   - Locale: Default locale is fine
   - Install pgAdmin 4 (optional but recommended for GUI management)

3. **Verify Installation**
   ```powershell
   psql --version
   ```

---

## Step 2: Create PostgreSQL Database

### Option A: Using psql Command Line

```powershell
# Connect to PostgreSQL as superuser
psql -U postgres

# Inside psql, run:
CREATE DATABASE capstone_db;

# Create a user (optional but recommended)
CREATE USER capstone_user WITH PASSWORD 'your_secure_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE capstone_db TO capstone_user;

# Exit psql
\q
```

### Option B: Using pgAdmin 4 (GUI)

1. Open pgAdmin 4
2. Right-click on "Databases" → Create → Database
3. Name: `capstone_db`
4. Owner: `postgres` (or create a new user)
5. Click "Save"

---

## Step 3: Backup Current SQLite Data

> [!WARNING]
> This is critical! Make sure you export your current data before proceeding.

1. **Navigate to backend directory**:
   ```powershell
   cd c:\Cap\Capstone\backend
   ```

2. **Create backup directory**:
   ```powershell
   mkdir backup
   ```

3. **Option A: Use Prisma Studio to export data** (Recommended)
   ```powershell
   npx prisma studio
   ```
   Then manually export important data from the web interface.

4. **Option B: Copy the SQLite database file**:
   ```powershell
   # Find your .db file (usually in prisma folder or root)
   # Copy it to backup
   copy prisma\dev.db backup\dev.db.backup
   ```

---

## Step 4: Update Prisma Schema

### 4.1 Modify `schema.prisma`

Update the datasource configuration in `c:\Cap\Capstone\backend\prisma\schema.prisma`:

```diff
datasource db {
-  provider = "sqlite"
+  provider = "postgresql"
   url      = env("DATABASE_URL")
}
```

### 4.2 Update Decimal Fields (if needed)

PostgreSQL handles `Decimal` types natively, unlike SQLite. Your current schema already uses `Decimal` correctly, so no changes needed.

### 4.3 Review Case-Sensitive Queries

> [!IMPORTANT]
> PostgreSQL is case-sensitive by default, unlike SQLite. You'll need to update queries that use case-insensitive matching.

In your codebase, there are comments about SQLite not supporting `mode: "insensitive"`. With PostgreSQL, you can now use this feature!

---

## Step 5: Create Environment Configuration

### 5.1 Create `.env` file

Create `c:\Cap\Capstone\backend\.env` with the following content:

```env
# PostgreSQL Connection String
DATABASE_URL="postgresql://capstone_user:your_secure_password@localhost:5432/capstone_db?schema=public"

# Alternative format if using default postgres user:
# DATABASE_URL="postgresql://postgres:your_postgres_password@localhost:5432/capstone_db?schema=public"

# Other environment variables
NODE_ENV=development
PORT=3000
JWT_SECRET=your_jwt_secret_here
```

**Connection String Format Explained:**
```
postgresql://[user]:[password]@[host]:[port]/[database]?schema=[schema]
```

### 5.2 Update `.gitignore`

Ensure `.env` is in `.gitignore` to avoid committing secrets:

```gitignore
.env
.env.local
.env.*.local
```

---

## Step 6: Delete Old Migrations

> [!CAUTION]
> Since you're changing database providers, existing SQLite migrations won't work with PostgreSQL.

```powershell
# Navigate to backend
cd c:\Cap\Capstone\backend

# Delete migrations folder
Remove-Item -Recurse -Force prisma\migrations
```

---

## Step 7: Install PostgreSQL Driver

Prisma will need the PostgreSQL driver:

```powershell
cd c:\Cap\Capstone\backend

# This should be handled automatically by Prisma, but you can force reinstall:
npm install @prisma/client
```

---

## Step 8: Create New Migration for PostgreSQL

### 8.1 Generate Initial Migration

```powershell
npx prisma migrate dev --name init
```

This will:
- Create a new `migrations` folder
- Generate SQL for PostgreSQL
- Apply the migration to your database
- Regenerate Prisma Client

### 8.2 Verify Database Schema

```powershell
# Open Prisma Studio to verify
npx prisma studio
```

You should see all your tables created in PostgreSQL.

---

## Step 9: Migrate Data from SQLite to PostgreSQL

Since you've created a fresh PostgreSQL database, you'll need to migrate your data.

### Option A: Manual Re-seeding (Recommended for Development)

If you have a seed script:

```powershell
npm run seed
```

### Option B: Export/Import Using Prisma

1. **Create a migration script** `c:\Cap\Capstone\backend\scripts\migrate-data.ts`:

```typescript
import { PrismaClient as SQLiteClient } from '@prisma/client';

// You'll need to temporarily create a second Prisma client for SQLite
// This is complex - Option A (re-seeding) is recommended

async function migrate() {
  // Connect to both databases
  // Export from SQLite
  // Import to PostgreSQL
  console.log('Migration complete');
}

migrate().catch(console.error);
```

### Option C: Use External Tool (pgloader)

For large datasets, consider using [pgloader](https://pgloader.io/):

```powershell
pgloader c:/Cap/Capstone/backend/prisma/dev.db postgresql://user:password@localhost/capstone_db
```

---

## Step 10: Update Code for PostgreSQL Features

### 10.1 Enable Case-Insensitive Search

Update queries in your routes to use `mode: "insensitive"`:

**Example in `c:\Cap\Capstone\backend\index.js` or routes:**

```diff
// Before (SQLite limitation)
where: { 
  nombre: searchTerm 
}

// After (PostgreSQL feature)
where: { 
  nombre: { 
    contains: searchTerm,
+   mode: "insensitive"
  }
}
```

### 10.2 Remove SQLite-specific Comments

Search for and update SQLite-specific comments in:
- `c:\Cap\Capstone\backend\src\routes\ingresos.ts`
- `c:\Cap\Capstone\backend\index.js`

### 10.3 Update Decimal Handling

PostgreSQL handles decimals natively, so you can simplify decimal operations. Update comments mentioning "Decimal compatible with SQLite".

---

## Step 11: Test the Application

### 11.1 Start the Development Server

```powershell
cd c:\Cap\Capstone\backend
npm run dev
```

### 11.2 Test Critical Endpoints

Test all CRUD operations:
- Create records (Products, Providers, Warehouses, etc.)
- Read/List records
- Update records
- Delete records
- Search functionality
- Filters and sorting

### 11.3 Check Logs

Monitor for any database-related errors:
- Connection issues
- Query errors
- Data type mismatches

---

## Step 12: Update Documentation

### 12.1 Update README.md

Document the new PostgreSQL requirement in your project README:

```markdown
## Database Setup

This project uses PostgreSQL. 

### Prerequisites
- PostgreSQL 14+ installed
- Database created: `capstone_db`

### Environment Variables
Create a `.env` file in the backend directory:
\`\`\`
DATABASE_URL="postgresql://user:password@localhost:5432/capstone_db"
\`\`\`

### Setup
\`\`\`bash
npm install
npx prisma migrate dev
npm run seed
\`\`\`
```

### 12.2 Update Team Documentation

If working with a team, ensure everyone:
- Installs PostgreSQL
- Updates their `.env` file
- Runs migrations
- Re-seeds the database

---

## Troubleshooting

### Common Issues and Solutions

#### Issue: Connection Refused

```
Error: Can't reach database server at localhost:5432
```

**Solution:**
- Verify PostgreSQL service is running
- Check port 5432 is not blocked
- Verify credentials in DATABASE_URL

```powershell
# Check if PostgreSQL is running
Get-Service -Name postgresql*
```

#### Issue: Authentication Failed

```
Error: password authentication failed for user
```

**Solution:**
- Double-check username and password in `.env`
- Reset PostgreSQL user password if needed

```sql
ALTER USER capstone_user WITH PASSWORD 'new_password';
```

#### Issue: Migration Fails

```
Error: P3018 Migration failed to apply cleanly
```

**Solution:**
- Delete all data in PostgreSQL database
- Drop and recreate the database
- Run migration again

```sql
DROP DATABASE capstone_db;
CREATE DATABASE capstone_db;
```

#### Issue: Prisma Client Not Updated

**Solution:**
```powershell
npx prisma generate
```

#### Issue: Case-Sensitive Query Issues

If searches aren't working:

**Solution:**
- Add `mode: "insensitive"` to string filters
- Or use PostgreSQL's `ILIKE` operator in raw queries

---

## PostgreSQL Best Practices

### 1. Connection Pooling

For production, configure connection pooling in Prisma:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}
```

Add to `.env`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/capstone_db?schema=public&connection_limit=10&pool_timeout=20"
```

### 2. Regular Backups

Create automated backups:

```powershell
# Backup command
pg_dump -U capstone_user -d capstone_db -F c -b -v -f backup/capstone_backup_$(Get-Date -Format "yyyyMMdd_HHmmss").dump

# Restore command
pg_restore -U capstone_user -d capstone_db -v backup/capstone_backup_YYYYMMDD_HHMMSS.dump
```

### 3. Monitoring

Install pgAdmin or use Prisma Studio for monitoring:
- Query performance
- Table sizes
- Index usage
- Connection count

### 4. Indexing

Review your schema for needed indexes. PostgreSQL benefits from proper indexing:

```prisma
model Producto {
  // ... fields
  
  @@index([sku])
  @@index([categoriaId])
  @@index([nombre])
}
```

Then run:
```powershell
npx prisma migrate dev --name add_indexes
```

---

## Rollback Plan

If you need to rollback to SQLite:

1. **Restore schema.prisma**:
   ```prisma
   datasource db {
     provider = "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

2. **Update .env**:
   ```env
   DATABASE_URL="file:./dev.db"
   ```

3. **Restore backup database**:
   ```powershell
   copy backup\dev.db.backup prisma\dev.db
   ```

4. **Regenerate client**:
   ```powershell
   npx prisma generate
   ```

---

## Next Steps After Migration

- [ ] Test all application features thoroughly
- [ ] Update any deployment configurations (Docker, hosting platforms)
- [ ] Configure PostgreSQL for production environment
- [ ] Set up database backups
- [ ] Monitor performance and optimize queries
- [ ] Update CI/CD pipeline if applicable
- [ ] Train team members on PostgreSQL-specific features

---

## Additional Resources

- [Prisma PostgreSQL Documentation](https://www.prisma.io/docs/concepts/database-connectors/postgresql)
- [PostgreSQL Official Documentation](https://www.postgresql.org/docs/)
- [Prisma Migration Guide](https://www.prisma.io/docs/guides/migrate-to-prisma/migrate-from-prisma-1)
- [PostgreSQL Performance Optimization](https://www.postgresql.org/docs/current/performance-tips.html)

---

> [!TIP]
> Keep your SQLite database backup for at least a few weeks after migration, in case you need to reference old data or rollback.
