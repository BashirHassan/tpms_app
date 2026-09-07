#!/bin/bash

# DigitalTP Deployment Script
# Usage: ./deploy.sh [full|backend|frontend]
#
# Deploys THE CHECKOUT THIS SCRIPT LIVES IN. Every target is derived, never
# hardcoded:
#
#   PROJECT_DIR   this script's own directory
#   BRANCH        the branch that checkout already tracks
#   PM2_APP_NAME  read from that checkout's ecosystem.config.js
#
# That matters because the copy of this script in /var/www/tpms_staging used
# to hardcode PROJECT_DIR=/var/www/tpms, PM2_APP_NAME=tpms-backend and
# `git reset --hard origin/main`, so running it from staging silently reset and
# restarted PRODUCTION.

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

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

main() {
    BRANCH="$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD)"

    if [ "$BRANCH" = "HEAD" ]; then
        print_error "$PROJECT_DIR has a detached HEAD - check out a branch before deploying."
        exit 1
    fi

    PM2_APP_NAME="$(node -p "require('$PROJECT_DIR/ecosystem.config.js').apps[0].name")"

    if [ -z "$PM2_APP_NAME" ]; then
        print_error "Could not read the PM2 app name from $PROJECT_DIR/ecosystem.config.js"
        exit 1
    fi

    show_target() {
        echo ""
        print_status "Directory : $PROJECT_DIR"
        print_status "Branch    : $BRANCH -> origin/$BRANCH"
        print_status "PM2 app   : $PM2_APP_NAME"
        echo ""
    }

    pull_latest() {
        print_status "Pulling latest changes from GitHub..."
        cd "$PROJECT_DIR"
        # No `git clean -fd` here. It has twice deleted server-only files that
        # nothing else recreated (the in-repo backups/ directory, and staging's
        # nginx config). `reset --hard` is enough to make tracked files match the
        # remote, and `rm -rf dist` below handles stale frontend build output.
        git fetch origin && git reset --hard "origin/$BRANCH"
        print_success "Code updated successfully!"
    }

    deploy_backend() {
        print_status "Deploying backend..."
        cd "$BACKEND_DIR"

        print_status "Installing dependencies..."
        npm install --production

        print_status "Running database migrations..."
        if ! npm run migrate -- --pending; then
            print_error "Database migration failed! Aborting deployment to prevent schema mismatch."
            exit 1
        fi
        print_success "Migrations applied"

        print_status "Restarting PM2 process..."
        pm2 restart "$PM2_APP_NAME" || pm2 start "$PROJECT_DIR/ecosystem.config.js" --env production

        print_success "Backend deployed successfully!"
    }

    deploy_frontend() {
        print_status "Deploying frontend..."
        cd "$FRONTEND_DIR"

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
            show_target
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
            show_target
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
            show_target
            pull_latest
            deploy_frontend
            print_success "Frontend deployment completed!"
            ;;
        *)
            echo "Usage: $0 [full|backend|frontend]"
            echo ""
            echo "  full     - Deploy both backend and frontend (default)"
            echo "  frontend - Deploy frontend only"
            echo "  backend  - Deploy backend only"
            echo ""
            echo "Deploys the checkout this script lives in:"
            echo "  directory : $PROJECT_DIR"
            echo "  branch    : $BRANCH"
            echo "  PM2 app   : $PM2_APP_NAME"
            exit 1
            ;;
    esac
}

# Called last so bash has parsed the entire file before executing any of it.
# pull_latest runs `git reset --hard`, which REPLACES this script on disk;
# bash reads scripts incrementally, so without this wrapper it would carry on
# reading the new file from its old byte offset and execute nonsense.
main "$@"
