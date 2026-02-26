# DigitalTP Deployment Guide

## Server Details
- **IP Address:** 207.180.224.105
- **OS:** Ubuntu 22.04.5 LTS
- **Repository:** https://github.com/BashirHassan/tpms_app.git
- **Database Panel:** https://db.kasuwapos.com/
- **Domain:** sitpms.com

---

## Cloudflare DNS Records

Add these DNS records in Cloudflare for the **sitpms.com** domain:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| A | `sitpms.com` | 207.180.224.105 | Proxied (orange) | Auto |
| A | `www` | 207.180.224.105 | Proxied (orange) | Auto |
| A | `app` | 207.180.224.105 | Proxied (orange) | Auto |
| A | `api` | 207.180.224.105 | Proxied (orange) | Auto |
| A | `*` | 207.180.224.105 | Proxied (orange) | Auto |

> **Note:** The wildcard `*` record is required for multi-tenant subdomain routing (e.g., `fuk.sitpms.com`, `gsu.sitpms.com`)

**Cloudflare SSL Settings (Universal SSL - Shared Certificate):**
- SSL/TLS mode: **Full (strict)**
  - *Cloudflare encrypts traffic end-to-end and validates the origin certificate*
  - *Requires a Cloudflare Origin Certificate installed on the origin server*
- Always Use HTTPS: **On**
- Minimum TLS Version: **1.2**
- Automatic HTTPS Rewrites: **On**

> **Note:** sitpms.com uses Cloudflare's shared Universal SSL certificate for visitor-facing encryption. With **Full (strict)** mode, a Cloudflare Origin Certificate is installed on the origin server (nginx) to encrypt traffic between Cloudflare and the origin. See the "Cloudflare Origin Certificate" section below for setup.

---

## Port Allocation (Avoid Conflicts)
| Project | Backend Port | PM2 Name |
|---------|--------------|----------|
| **MedeePay** | **5005** | **medeepay-backend** |
| **Bokkis Payslip** | **5006** | **bokkis-backend** |
| **DigitalTP** | **5007** | **digitaltp-backend** |

---

## 1. Initial Server Setup (One-time)

### SSH into the server
```bash
ssh psimas21@207.180.224.105
```

### Clone the repository (using auto-clone script)
```bash
~/clone_from_bash_repo tpms_app /var/www/digitaltp
```

### Or manual clone
```bash
sudo mkdir -p /var/www/digitaltp
sudo chown -R $USER:$USER /var/www/digitaltp
cd /var/www/digitaltp
git clone https://github.com/BashirHassan/tpms_app.git .
```

### Run Setup Script (Recommended)
```bash
chmod +x setup.sh
./setup.sh
```

### Or Manual Setup

#### Install Backend Dependencies
```bash
cd /var/www/digitaltp/backend
npm install --production
```

#### Install Frontend Dependencies & Build
```bash
cd /var/www/digitaltp/frontend
npm install
npm run build
```

---

## 2. Environment Configuration

### Backend Environment (.env)
Create the file `/var/www/digitaltp/backend/.env`:

```bash
nano /var/www/digitaltp/backend/.env
```

Add the following content:
```env
# Server
NODE_ENV=production
PORT=5007

# Database (Configure via https://db.kasuwapos.com/)
DB_HOST=localhost
DB_PORT=3306
DB_USER=digitaltp_user
DB_PASSWORD=your_secure_password
DB_NAME=digitaltp

# JWT
JWT_SECRET=your-super-secure-jwt-secret-change-this
JWT_EXPIRES_IN=7d

# CORS (Update with your actual domain)
CORS_ORIGIN=https://app.sitpms.com

# App Configuration
APP_NAME=DigitalTP
APP_URL=https://app.sitpms.com

# SMTP Configuration (System emails)
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@sitpms.com
SMTP_PASS=your-email-password
EMAIL_FROM=noreply@sitpms.com

# Cloudinary (for image uploads)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Paystack (for payments)
PAYSTACK_SECRET_KEY=your-paystack-secret-key
PAYSTACK_PUBLIC_KEY=your-paystack-public-key

# Encryption (for student PINs - must be 32 characters)
ENCRYPTION_KEY=your-32-character-encryption-key

# Security
BCRYPT_ROUNDS=12
TRUST_PROXY=true
```

### Generate Secure JWT Secret
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Generate Encryption Key (32 characters)
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### Frontend Environment (.env.production)
Create the file `/var/www/digitaltp/frontend/.env.production`:

```bash
nano /var/www/digitaltp/frontend/.env.production
```

Add the following content:
```env
VITE_API_URL=/api
VITE_APP_NAME=DigitalTP
```

> **Note:** Using a relative `/api` URL means the frontend calls the same domain (e.g., `fuk.sitpms.com`), and nginx proxies `/api/` requests to the backend. This avoids CORS issues entirely and preserves subdomain context for multi-tenancy.

---

## 3. Database Setup

### Create Database
1. Go to https://db.kasuwapos.com/
2. Create a new database named `digitaltp`
3. Create a user with appropriate privileges
4. Update the `.env` file with the credentials

### Import Schema
```bash
cd /var/www/digitaltp
mysql -u digitaltp_user -p digitaltp < backend/database/digitaltp.sql
```

### Run Migrations
```bash
cd /var/www/digitaltp/backend
npm run migrate
```

---

## 4. PM2 Configuration

### Start the backend with PM2
```bash
cd /var/www/digitaltp
pm2 start ecosystem.config.js --env production
pm2 save
```

### View PM2 status
```bash
pm2 status
pm2 logs digitaltp-backend
```

### Restart after code changes
```bash
pm2 restart digitaltp-backend
```

---

## 5. Nginx Configuration

### Create Nginx config for the application
```bash
sudo nano /etc/nginx/sites-available/sitpms
```

Or copy from project:
```bash
sudo cp /var/www/digitaltp/nginx/sitpms.conf /etc/nginx/sites-available/sitpms
```

### Enable the site
```bash
sudo ln -s /etc/nginx/sites-available/sitpms /etc/nginx/sites-enabled/
```

### Test and reload Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. SSL Configuration (Cloudflare Origin Certificate)

SSL mode is **Full (strict)** — Cloudflare encrypts end-to-end and validates the origin certificate.

### Generate Origin Certificate in Cloudflare
1. Go to SSL/TLS → Origin Server → Create Certificate
2. Choose RSA (2048) key type
3. Add hostnames: `*.sitpms.com`, `sitpms.com`
4. Choose certificate validity (15 years recommended)
5. Copy the Origin Certificate and Private Key

### Install on the server
```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/sitpms.com.pem     # Paste Origin Certificate
sudo nano /etc/ssl/cloudflare/sitpms.com.key     # Paste Private Key
sudo chmod 600 /etc/ssl/cloudflare/sitpms.com.key
```

### Verify SSL is working
```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I https://app.sitpms.com
```

> **Note:** The nginx config already includes `listen 443 ssl` and references the Cloudflare Origin Certificate paths. Just install the cert files and reload nginx.

---

## 7. Daily Deployment

### Full Deployment (Backend + Frontend)
```bash
cd /var/www/digitaltp
./deploy.sh full
```

### Backend Only
```bash
./deploy.sh backend
```

### Frontend Only
```bash
./deploy.sh frontend
```

### Manual Quick Deploy
```bash
cd /var/www/digitaltp
git pull origin main
cd backend && npm install --production && npm run migrate
cd ../frontend && npm install && npm run build
pm2 restart digitaltp-backend
```

---

## 8. Troubleshooting

### Check PM2 Logs
```bash
pm2 logs digitaltp-backend --lines 100
pm2 logs digitaltp-backend --err --lines 50
```

### Check Nginx Error Logs
```bash
sudo tail -f /var/log/nginx/error.log
```

### Restart Services
```bash
pm2 restart digitaltp-backend
sudo systemctl reload nginx
```

### Health Check
```bash
curl http://127.0.0.1:5007/api/health
curl https://api.sitpms.com/api/health
```

### Check Port Usage
```bash
sudo lsof -i :5007
```

### Database Connection Test
```bash
cd /var/www/digitaltp/backend
node -e "const db = require('./src/db/database'); db.query('SELECT 1').then(() => { console.log('DB OK'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"
```

---

## 9. Backup & Maintenance

### Database Backup
```bash
mysqldump -u digitaltp_user -p digitaltp > ~/backups/digitaltp_$(date +%Y%m%d).sql
```

### Full Project Backup
```bash
tar -czvf ~/backups/digitaltp_full_$(date +%Y%m%d).tar.gz /var/www/digitaltp
```

---

## 10. Directory Structure on VPS

```
/var/www/digitaltp/
├── backend/
│   ├── .env                 # Production environment
│   ├── src/
│   │   ├── server.js        # Main entry point
│   │   ├── config/          # Environment config
│   │   ├── controllers/     # Route handlers
│   │   ├── db/              # Database connection & queries
│   │   ├── middleware/      # Auth, validation, error handling
│   │   ├── models/          # Data models
│   │   ├── routes/          # Express routers
│   │   ├── services/        # Email, Cloudinary, Paystack, etc.
│   │   └── utils/           # Helper functions
│   ├── database/
│   │   ├── migrations/      # SQL migration files
│   │   └── seeds/           # Seed data
│   └── uploads/             # Uploaded files
│       ├── acceptances/
│       ├── results/
│       ├── schools/
│       └── students/
├── frontend/
│   ├── .env.production      # Frontend production env
│   ├── dist/                # Built frontend (served by nginx)
│   └── src/                 # Source code
├── docs/                    # Documentation
├── logs/
│   ├── pm2-out.log          # PM2 stdout
│   └── pm2-error.log        # PM2 stderr
├── nginx/
│   └── sitpms.conf          # Nginx configuration
├── ecosystem.config.js      # PM2 configuration
├── deploy.sh                # Deployment script
├── setup.sh                 # Initial setup script
└── DEPLOYMENT.md            # This file
```

---

## 11. Multi-Tenancy Notes

DigitalTP uses **subdomain-based multi-tenancy**. Each institution has its own subdomain:
- `fuk.sitpms.com` - FUKASHERE
- `gsu.sitpms.com` - GSU
- etc.

The nginx wildcard configuration (`*.sitpms.com`) routes all subdomain requests to the same frontend. The frontend extracts the subdomain and includes it in API calls to determine the institution context.

### Adding a New Institution
1. No nginx changes needed (wildcard handles all subdomains)
2. Add the institution record in the database with the appropriate `subdomain` value
3. The new subdomain will work automatically

---

## Quick Reference

| Action | Command |
|--------|---------|
| SSH to server | `ssh psimas21@207.180.224.105` |
| Go to project | `cd /var/www/digitaltp` |
| Deploy all | `./deploy.sh full` |
| Deploy backend | `./deploy.sh backend` |
| Deploy frontend | `./deploy.sh frontend` |
| View logs | `pm2 logs digitaltp-backend` |
| Restart backend | `pm2 restart digitaltp-backend` |
| Nginx reload | `sudo systemctl reload nginx` |
| Health check | `curl http://127.0.0.1:5007/api/health` |
| Run migrations | `cd backend && npm run migrate` |
