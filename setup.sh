#!/bin/bash
# =============================================================
# DIGITALTP - Server Setup Script
# Works for both local development and VPS production setup
# =============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

PROJECT_DIR="/var/www/digitaltp"

echo ""
echo "======================================"
echo "     DIGITALTP - Server Setup         "
echo "======================================"
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    print_warning "Not running as root. Some operations may fail."
fi

# Check for Node.js
print_status "Checking Node.js version..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    echo "Run: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "Then: sudo apt-get install -y nodejs"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js 18+ required. Current: $(node -v)"
    exit 1
fi
print_success "Node.js version: $(node -v)"

# Create project directory
print_status "Creating project directory..."
sudo mkdir -p $PROJECT_DIR
sudo chown -R $USER:$USER $PROJECT_DIR

# Create logs directory
print_status "Creating logs directory..."
mkdir -p $PROJECT_DIR/logs

# Create uploads directories
print_status "Creating uploads directories..."
mkdir -p $PROJECT_DIR/backend/uploads/acceptances
mkdir -p $PROJECT_DIR/backend/uploads/results
mkdir -p $PROJECT_DIR/backend/uploads/schools
mkdir -p $PROJECT_DIR/backend/uploads/students

# Clone repository using helper command
if [ -d "$PROJECT_DIR/.git" ]; then
    print_warning "Repository already exists. Pulling latest changes..."
    cd $PROJECT_DIR
    git fetch origin && git reset --hard origin/main && git clean -fd
else
    print_status "Cloning repository..."
    ~/clone_from_bash_repo tpms_app /var/www/digitaltp
fi

cd $PROJECT_DIR

# Install backend dependencies
print_status "Installing backend dependencies..."
cd $PROJECT_DIR/backend
npm install --production

# Install frontend dependencies
print_status "Installing frontend dependencies..."
cd $PROJECT_DIR/frontend
npm install

# Create environment files
print_status "Creating environment files..."

if [ ! -f "$PROJECT_DIR/backend/.env" ]; then
    cat > $PROJECT_DIR/backend/.env << 'EOF'
# Server
NODE_ENV=production
PORT=5007

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=digitaltp_user
DB_PASSWORD=your_secure_password
DB_NAME=digitaltp

# JWT
JWT_SECRET=your-super-secure-jwt-secret-change-this
JWT_EXPIRES_IN=7d

# CORS
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

# Encryption (for student PINs)
ENCRYPTION_KEY=your-32-character-encryption-key

# Security
BCRYPT_ROUNDS=12
TRUST_PROXY=true
EOF
    print_warning "Backend .env created. Please edit it with your production values!"
else
    print_status "Backend .env already exists."
fi

if [ ! -f "$PROJECT_DIR/frontend/.env.production" ]; then
    cat > $PROJECT_DIR/frontend/.env.production << 'EOF'
VITE_API_URL=/api
VITE_APP_NAME=DigitalTP
EOF
    print_warning "Frontend .env.production created."
else
    print_status "Frontend .env.production already exists."
fi

# Build frontend
print_status "Building frontend..."
cd $PROJECT_DIR/frontend
npm run build

# Setup PM2
print_status "Setting up PM2..."
cd $PROJECT_DIR

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    print_status "Installing PM2 globally..."
    sudo npm install -g pm2
fi

# Start the application with PM2
print_status "Starting backend with PM2..."
pm2 start ecosystem.config.js --env production
pm2 save

# Setup PM2 to start on boot
print_status "Setting up PM2 startup..."
pm2 startup systemd -u $USER --hp /home/$USER || true

print_success "============================================"
print_success "      DIGITALTP Setup Complete!            "
print_success "============================================"
echo ""
print_status "Next steps:"
echo "  1. Edit /var/www/digitaltp/backend/.env with your database credentials"
echo "  2. Create database 'digitaltp' and import schema"
echo "  3. Copy nginx config: sudo cp nginx/sitpms.conf /etc/nginx/sites-available/sitpms"
echo "  4. Enable nginx site: sudo ln -s /etc/nginx/sites-available/sitpms /etc/nginx/sites-enabled/"
echo "  5. Test nginx: sudo nginx -t && sudo systemctl reload nginx"
echo "  6. Configure Cloudflare DNS records (see DEPLOYMENT.md)"
echo ""
