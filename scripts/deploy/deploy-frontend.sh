#!/bin/bash
# Deploy frontend to S3 and invalidate CloudFront cache
# Usage: ./deploy-frontend.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# AWS Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-971422717446}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# S3 and CloudFront
S3_BUCKET="peakspend-frontend-${ENVIRONMENT}-${AWS_ACCOUNT_ID}"
CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-E1O89SL2CFI9W5}"

# API URL for production
VITE_API_URL="${VITE_API_URL:-https://rczwkm4t9i.us-east-1.awsapprunner.com/}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# Build frontend for production
build_frontend() {
    log_step "Building frontend for production..."

    cd "$FRONTEND_DIR"

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        npm ci
    fi

    # Build with production API URL
    log_info "Building with VITE_API_URL=$VITE_API_URL"
    VITE_API_URL="$VITE_API_URL" npm run build

    log_info "Frontend build complete"
}

# Sync to S3
sync_to_s3() {
    log_step "Syncing to S3 bucket: $S3_BUCKET"

    # Sync dist folder to S3
    aws s3 sync \
        "$FRONTEND_DIR/dist" \
        "s3://${S3_BUCKET}/" \
        --delete \
        --cache-control "public, max-age=31536000, immutable" \
        --exclude "*.html" \
        --region "$AWS_REGION"

    # Sync HTML files with no-cache
    aws s3 sync \
        "$FRONTEND_DIR/dist" \
        "s3://${S3_BUCKET}/" \
        --delete \
        --cache-control "no-cache, no-store, must-revalidate" \
        --exclude "*" \
        --include "*.html" \
        --region "$AWS_REGION"

    log_info "S3 sync complete"
}

# Invalidate CloudFront cache
invalidate_cloudfront() {
    log_step "Invalidating CloudFront cache..."

    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text)

    log_info "Invalidation created: $INVALIDATION_ID"

    # Wait for invalidation to complete
    log_step "Waiting for invalidation to complete..."

    aws cloudfront wait invalidation-completed \
        --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
        --id "$INVALIDATION_ID"

    log_info "CloudFront invalidation complete"
}

# Get CloudFront URL
get_cloudfront_url() {
    log_step "Getting CloudFront URL..."

    DOMAIN=$(aws cloudfront get-distribution \
        --id "$CLOUDFRONT_DISTRIBUTION_ID" \
        --query 'Distribution.DomainName' \
        --output text)

    log_info "Frontend deployed to: https://${DOMAIN}"
}

# Main execution
log_info "=== Frontend Deployment ==="
log_info "AWS Region: $AWS_REGION"
log_info "AWS Account: $AWS_ACCOUNT_ID"
log_info "Environment: $ENVIRONMENT"
log_info "S3 Bucket: $S3_BUCKET"
log_info "CloudFront Distribution: $CLOUDFRONT_DISTRIBUTION_ID"
log_info "API URL: $VITE_API_URL"

build_frontend
sync_to_s3
invalidate_cloudfront
get_cloudfront_url

log_info "=== Frontend deployment complete! ==="
