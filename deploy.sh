#!/bin/bash

# DigitalTP Deployment Script
# Usage: ./deploy.sh [full|backend|frontend]

set -e

PROJECT_DIR="/var/www/tpms"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PM2_APP_NAME="tpms-backend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

pull_latest() {
    print_status "Pulling latest changes from GitHub..."
    cd $PROJECT_DIR
    git fetch origin && git reset --hard origin/main && git clean -fd
    print_success "Code updated successfully!"
}

deploy_backend() {
    print_status "Deploying backend..."
    cd $BACKEND_DIR

    print_status "Installing dependencies..."
    npm install --production

    print_status "Running database migrations..."
    npm run migrate || print_warning "Migration failed or no new migrations"

    print_status "Restarting PM2 process..."
    pm2 restart $PM2_APP_NAME || pm2 start $PROJECT_DIR/ecosystem.config.js --env production

    print_success "Backend deployed successfully!"
}

deploy_frontend() {
    print_status "Deploying frontend..."
    cd $FRONTEND_DIR

    print_status "Installing dependencies..."
    npm install

    print_status "Removing old build..."
    rm -rf dist

    print_status "Building production bundle..."
    npm run build

    print_success "Frontend deployed successfully!"
}

show_status() {
    echo ""
    print_status "Current PM2 Status:"
    pm2 status
    echo ""
}

# Main deployment logic
case "${1:-full}" in
    full)
        echo ""
        echo "======================================"
        echo "     DigitalTP Full Deployment        "
        echo "======================================"
        echo ""
        pull_latest
        deploy_backend
        deploy_frontend
        show_status
        print_success "Full deployment completed!"
        ;;
    backend)
        echo ""
        echo "======================================"
        echo "    DigitalTP Backend Deployment      "
        echo "======================================"
        echo ""
        pull_latest
        deploy_backend
        show_status
        print_success "Backend deployment completed!"
        ;;
    frontend)
        echo ""
        echo "======================================"
        echo "    DigitalTP Frontend Deployment     "
        echo "======================================"
        echo ""
        pull_latest
        deploy_frontend
        print_success "Frontend deployment completed!"
        ;;
    *)
        echo "Usage: $0 [full|backend|frontend]"
        echo ""
        echo "  full     - Deploy both backend and frontend (default)"
        echo "  backend  - Deploy backend only"
        echo "  frontend - Deploy frontend only"
        exit 1
        ;;
esac
