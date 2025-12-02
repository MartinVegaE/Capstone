# Fire Stock Management System - Deployment Guide

Complete guide for deploying the Fire Stock inventory management system to production environments.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Environment Configuration](#environment-configuration)
5. [Database Setup](#database-setup)
6. [Backend Deployment](#backend-deployment)
7. [Frontend Deployment](#frontend-deployment)
8. [Production Checklist](#production-checklist)
9. [Security Considerations](#security-considerations)
10. [Monitoring & Maintenance](#monitoring--maintenance)
11. [Troubleshooting](#troubleshooting)

---

## Project Overview

**Fire Stock** is an inventory management system with the following components:

- **Backend API**: Express.js + PostgreSQL + Prisma ORM
- **Frontend Web**: React + Vite + TailwindCSS
- **Database**: PostgreSQL 14+
- **Authentication**: JWT-based authentication with bcrypt

### Key Features
- Product catalog management (PPP cost tracking)
- Stock movements and adjustments
- Project-based inventory allocation
- Supplier and warehouse management
- User authentication and role-based access

---

## Prerequisites

### System Requirements

#### Development Environment
- **Node.js**: v18.x or higher (v25.x recommended)
- **PostgreSQL**: 14.x or higher
- **npm**: v9.x or higher
- **Git**: Latest version

#### Production Environment
- **Server**: Linux (Ubuntu 22.04 LTS recommended) or Windows Server
- **RAM**: Minimum 2GB (4GB+ recommended)
- **CPU**: 2+ cores
- **Storage**: 20GB+ free space
- **Domain**: (optional) for HTTPS

### Required Tools
```bash
# Verify installations
node --version          # Should be v18+
npm --version           # Should be v9+
psql --version          # Should be 14+
git --version           # Latest
```

---

## Architecture

```
┌─────────────────┐
│   Users/        │
│   Browsers      │
└────────┬────────┘
         │
         │ HTTPS
         ▼
┌─────────────────┐
│  Frontend       │
│  (React + Vite) │
│  Port: 5173/80  │
└────────┬────────┘
         │
         │ API Calls
         ▼
┌─────────────────┐
│  Backend API    │
│  (Express.js)   │
│  Port: 3000     │
└────────┬────────┘
         │
         │ Prisma ORM
         ▼
┌─────────────────┐
│  PostgreSQL     │
│  Port: 5432     │
└─────────────────┘
```

---

## Environment Configuration

### Backend Environment Variables

Create `backend/.env`:

```env
# Database Configuration
DATABASE_URL="postgresql://fire_stock_user:YOUR_SECURE_PASSWORD@localhost:5432/fire_stock_db?schema=public"

# Server Configuration
NODE_ENV=production
PORT=3000

# JWT Authentication
JWT_SECRET=YOUR_JWT_SECRET_HERE_USE_STRONG_RANDOM_STRING
JWT_EXPIRES_IN=24h

# CORS Configuration (comma-separated)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Optional: Connection Pool
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

### Frontend Environment Variables

Create `frontend/.env.production`:

```env
# Backend API URL
VITE_API_URL=https://api.yourdomain.com

# OR if frontend and backend are on same domain
VITE_API_URL=/api
```

### Generating Secure Secrets

```bash
# Generate JWT_SECRET (Linux/Mac)
openssl rand -base64 64

# Generate JWT_SECRET (Windows PowerShell)
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))

# Generate strong password
openssl rand -base64 32
```

---

## Database Setup

### 1. Install PostgreSQL

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Windows
Download from [postgresql.org](https://www.postgresql.org/download/windows/)

### 2. Create Database and User

```bash
# Connect as postgres superuser
sudo -u postgres psql

# Or on Windows
psql -U postgres
```

```sql
-- Create database
CREATE DATABASE fire_stock_db;

-- Create user with password
CREATE USER fire_stock_user WITH PASSWORD 'YOUR_SECURE_PASSWORD';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE fire_stock_db TO fire_stock_user;

-- Connect to database
\c fire_stock_db

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO fire_stock_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fire_stock_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fire_stock_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO fire_stock_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO fire_stock_user;

-- Allow user to create databases (for migrations)
ALTER USER fire_stock_user CREATEDB;

-- Exit
\q
```

### 3. Configure PostgreSQL for Remote Access (if needed)

Edit `/etc/postgresql/14/main/postgresql.conf`:
```conf
listen_addresses = '*'  # Or specific IP
```

Edit `/etc/postgresql/14/main/pg_hba.conf`:
```conf
# Allow connections from your app server
host    fire_stock_db    fire_stock_user    YOUR_SERVER_IP/32    md5
```

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### 4. Test Database Connection

```bash
psql -h localhost -U fire_stock_user -d fire_stock_db
```

---

## Backend Deployment

### Development Deployment

```bash
# 1. Clone repository
git clone https://github.com/your-repo/Capstone.git
cd Capstone/backend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
nano .env  # Edit with your values

# 4. Run migrations
npx prisma migrate deploy

# 5. Generate Prisma Client
npx prisma generate

# 6. (Optional) Seed initial data
npm run seed

# 7. Start development server
npm run dev
```

Server will be available at `http://localhost:3000`

### Production Deployment

#### Option 1: Traditional Server (Ubuntu)

```bash
# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Install PM2 (process manager)
sudo npm install -g pm2

# 4. Create deployment directory
sudo mkdir -p /var/www/fire-stock
sudo chown $USER:$USER /var/www/fire-stock
cd /var/www/fire-stock

# 5. Clone repository
git clone https://github.com/your-repo/Capstone.git .

# 6. Install backend dependencies
cd backend
npm install --production

# 7. Configure environment
nano .env  # Set production values

# 8. Run database migrations
npx prisma migrate deploy
npx prisma generate

# 9. Build TypeScript (if using)
npm run build

# 10. Start with PM2
pm2 start index.js --name fire-stock-api
pm2 save
pm2 startup

# 11. Configure PM2 to restart on reboot
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER
```

#### Option 2: Docker Deployment

Create `backend/Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --production

# Copy application code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"]
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: fire_stock_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: fire_stock_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://fire_stock_user:${DB_PASSWORD}@postgres:5432/fire_stock_db?schema=public
      JWT_SECRET: ${JWT_SECRET}
      NODE_ENV: production
    ports:
      - "3000:3000"
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  postgres_data:
```

Deploy with Docker:
```bash
# Create .env file with secrets
echo "DB_PASSWORD=your_secure_password" > .env
echo "JWT_SECRET=your_jwt_secret" >> .env

# Build and start
docker-compose up -d

# Run migrations
docker-compose exec backend npx prisma migrate deploy
```

### Reverse Proxy with Nginx

```nginx
# /etc/nginx/sites-available/fire-stock-api
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/fire-stock-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d api.yourdomain.com

# Certbot will auto-renewal setup
sudo systemctl status certbot.timer
```

---

## Frontend Deployment

### Build for Production

```bash
cd frontend

# Install dependencies
npm install

# Create production .env
nano .env.production  # Set VITE_API_URL

# Build
npm run build
```

Build output will be in `frontend/dist/`

### Deployment Options

#### Option 1: Static Hosting (Nginx)

```bash
# Copy build to web directory
sudo cp -r dist/* /var/www/fire-stock-frontend/

# Nginx configuration
sudo nano /etc/nginx/sites-available/fire-stock-frontend
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    root /var/www/fire-stock-frontend;
    index index.html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/fire-stock-frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### Option 2: Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel --prod
```

#### Option 3: Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
cd frontend
netlify deploy --prod --dir=dist
```

---

## Production Checklist

### Before Deployment

- [ ] Update all dependencies to latest stable versions
- [ ] Remove all console.log statements
- [ ] Set NODE_ENV=production
- [ ] Configure strong JWT_SECRET
- [ ] Set up strong database password
- [ ] Configure CORS for production domains only
- [ ] Enable HTTPS/SSL certificates
- [ ] Set up database backups
- [ ] Configure firewall rules
- [ ] Set up monitoring and logging

### Security

- [ ] SQL injection protection (Prisma handles this)
- [ ] XSS protection (React handles this)
- [ ] CSRF tokens if needed
- [ ] Rate limiting on API
- [ ] Input validation with Zod
- [ ] Secure password hashing (bcrypt)
- [ ] JWT token expiration configured
- [ ] HTTPS enforced
- [ ] Database access restricted
- [ ] Environment variables secured

### Performance

- [ ] Enable gzip compression
- [ ] Configure caching headers
- [ ] Optimize database queries
- [ ] Add database indexes
- [ ] Implement API rate limiting
- [ ] Enable CDN for static assets
- [ ] Minify frontend assets

---

## Security Considerations

### Database Security

```sql
-- Restrict database user permissions (production)
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM fire_stock_user;
GRANT USAGE ON SCHEMA public TO fire_stock_user;
```

### API Security

Create `backend/middleware/rateLimiter.js`:

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

module.exports = limiter;
```

Apply in `index.js`:
```javascript
const rateLimiter = require('./middleware/rateLimiter');
app.use('/api', rateLimiter);
```

### Helmet for Security Headers

```bash
npm install helmet
```

```javascript
const helmet = require('helmet');
app.use(helmet());
```

---

## Monitoring & Maintenance

### PM2 Monitoring

```bash
# View logs
pm2 logs fire-stock-api

# Monitor resources
pm2 monit

# Restart app
pm2 restart fire-stock-api

# Reload with zero downtime
pm2 reload fire-stock-api
```

### Database Backups

#### Automated Daily Backups

```bash
# Create backup script
sudo nano /usr/local/bin/backup-firestock-db.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/fire-stock"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U fire_stock_user -h localhost fire_stock_db > $BACKUP_DIR/firestock_$DATE.sql

# Keep only last 30 days
find $BACKUP_DIR -name "firestock_*.sql" -mtime +30 -delete

echo "Backup completed: firestock_$DATE.sql"
```

```bash
# Make executable
sudo chmod +x /usr/local/bin/backup-firestock-db.sh

# Add to crontab (daily at 2 AM)
sudo crontab -e
```

Add:
```cron
0 2 * * * /usr/local/bin/backup-firestock-db.sh >> /var/log/firestock-backup.log 2>&1
```

#### Restore from Backup

```bash
psql -U fire_stock_user -h localhost -d fire_stock_db < /var/backups/fire-stock/firestock_YYYYMMDD_HHMMSS.sql
```

### Log Management

```bash
# PM2 log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## Troubleshooting

### Backend Issues

#### Problem: "Cannot connect to database"

**Solution:**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -U fire_stock_user -d fire_stock_db

# Check DATABASE_URL in .env
```

#### Problem: "Port 3000 already in use"

**Solution:**
```bash
# Find process using port
lsof -i :3000  # Linux/Mac
netstat -ano | findstr :3000  # Windows

# Kill process
kill -9 PID  # Linux/Mac
taskkill /PID PID /F  # Windows
```

####  Problem: "Prisma Client not found"

**Solution:**
```bash
npx prisma generate
```

### Frontend Issues

#### Problem: "API calls failing (CORS)"

**Solution:** Check backend CORS configuration in `index.js`:
```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
```

#### Problem: "404 on refresh (SPA routing)"

**Solution:** Configure server to always serve `index.html` (see Nginx config above)

### Database Issues

#### Problem: "Too many connections"

**Solution:**
```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'fire_stock_db';

-- Increase max_connections in postgresql.conf
max_connections = 100
```

#### Problem: "Slow queries"

**Solution:**
```sql
-- Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log queries > 1s
SELECT pg_reload_conf();

-- Check slow queries
SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;
```

---

## Deployment Scripts

### Quick Deploy Script

Create `deploy.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# Pull latest code
git pull origin main

# Backend
cd backend
echo "📦 Installing backend dependencies..."
npm install --production

echo "🗄️  Running database migrations..."
npx prisma migrate deploy
npx prisma generate

echo "🔄 Restarting backend..."
pm2 reload fire-stock-api

# Frontend
cd ../frontend
echo "📦 Installing frontend dependencies..."
npm install

echo "🏗️  Building frontend..."
npm run build

echo "📁 Copying frontend files..."
sudo cp -r dist/* /var/www/fire-stock-frontend/

echo "✅ Deployment complete!"
```

Make executable:
```bash
chmod +x deploy.sh
```

---

## Support & Resources

- **Prisma Docs**: https://www.prisma.io/docs
- **Express.js Docs**: https://expressjs.com
- **React Docs**: https://react.dev
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **PM2 Docs**: https://pm2.keymetrics.io/

---

**Last Updated:** December 2, 2025  
**System Version:** 1.0.0  
**PostgreSQL Version:** 15+  
**Node.js Version:** 20+
