#!/bin/bash
# Master deployment script - deploys all services to production
# Usage: ./deploy-all.sh [--skip-build] [--skip-push] [--backend-only] [--frontend-only]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Options
SKIP_BUILD=false
SKIP_PUSH=false
BACKEND_ONLY=false
FRONTEND_ONLY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-push)
            SKIP_PUSH=true
            shift
            ;;
        --backend-only)
            BACKEND_ONLY=true
            shift
            ;;
        --frontend-only)
            FRONTEND_ONLY=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--skip-build] [--skip-push] [--backend-only] [--frontend-only]"
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_header() { echo -e "\n${CYAN}========================================${NC}"; echo -e "${CYAN}$1${NC}"; echo -e "${CYAN}========================================${NC}\n"; }

# Make scripts executable
chmod +x "$SCRIPT_DIR"/*.sh

log_header "PeakSpend Production Deployment"

# Track start time
START_TIME=$(date +%s)

# Deploy backend services
if [ "$FRONTEND_ONLY" = false ]; then
    log_header "Step 1/5: Building Docker Images"
    if [ "$SKIP_BUILD" = false ]; then
        "$SCRIPT_DIR/build-docker-cloud.sh" all
    else
        log_warn "Skipping Docker build (--skip-build)"
    fi

    log_header "Step 2/5: Pushing to ECR"
    if [ "$SKIP_PUSH" = false ]; then
        "$SCRIPT_DIR/push-to-ecr.sh" all
    else
        log_warn "Skipping ECR push (--skip-push)"
    fi

    log_header "Step 3/5: Deploying App Runner (Backend)"
    "$SCRIPT_DIR/deploy-apprunner.sh"

    log_header "Step 4/5: Deploying ECS Services"
    "$SCRIPT_DIR/deploy-ecs.sh" all
else
    log_warn "Skipping backend deployment (--frontend-only)"
fi

# Deploy frontend
if [ "$BACKEND_ONLY" = false ]; then
    log_header "Step 5/5: Deploying Frontend"
    "$SCRIPT_DIR/deploy-frontend.sh"
else
    log_warn "Skipping frontend deployment (--backend-only)"
fi

# Calculate duration
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

log_header "Deployment Complete!"
log_info "Total deployment time: ${MINUTES}m ${SECONDS}s"
log_info ""
log_info "Deployed Services:"
if [ "$FRONTEND_ONLY" = false ]; then
    log_info "  - Backend (App Runner): https://rczwkm4t9i.us-east-1.awsapprunner.com"
    log_info "  - ML Service (ECS)"
    log_info "  - MLflow (ECS)"
    log_info "  - Workers (ECS)"
fi
if [ "$BACKEND_ONLY" = false ]; then
    log_info "  - Frontend (CloudFront/S3)"
fi
log_info ""
log_info "Next steps:"
log_info "  1. Verify health: curl https://rczwkm4t9i.us-east-1.awsapprunner.com/health"
log_info "  2. Check logs: aws logs tail /aws/apprunner/peakspend-production-backend --follow"
log_info "  3. Monitor dashboard: https://console.aws.amazon.com/cloudwatch"
