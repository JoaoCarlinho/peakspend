# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript with relaxed config
RUN npx tsc -p tsconfig.build.json

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy Prisma client to both locations for compatibility
# - dist/generated/prisma for compiled JS imports (../generated/prisma from dist/services/)
# - src/generated/prisma for any source references
COPY --from=builder /app/src/generated/prisma ./dist/generated/prisma
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma

# Copy config files (required for security services)
COPY --from=builder /app/config ./config

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application with migrations
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
