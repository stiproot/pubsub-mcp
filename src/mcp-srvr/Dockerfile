# Stage 1: Builder
FROM node:24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Install Netskope certificate if present
COPY nscacert.pem /usr/local/share/ca-certificates/nscacert.crt 2>/dev/null || true
RUN if [ -f /usr/local/share/ca-certificates/nscacert.crt ]; then \
      update-ca-certificates; \
    fi

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:24-alpine

# Install PM2, Nginx, and runtime dependencies
RUN apk add --no-cache nginx shadow

# Create app user
RUN useradd -m -u 1001 appuser

# Setup Nginx directories
RUN mkdir -p /var/log/nginx /var/cache/nginx /var/lib/nginx/tmp && \
    chown -R appuser:appuser /var/log/nginx /var/cache/nginx /var/lib/nginx

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy configuration files
COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/http.d/default.conf
COPY ecosystem.config.cjs ./
COPY start.sh ./

# Install Netskope certificate if present
COPY nscacert.pem /usr/local/share/ca-certificates/nscacert.crt 2>/dev/null || true
RUN if [ -f /usr/local/share/ca-certificates/nscacert.crt ]; then \
      update-ca-certificates; \
    fi

# Set permissions
RUN chown -R appuser:appuser /app && \
    chmod +x start.sh

# Install PM2 globally
RUN npm install -g pm2

# Switch to non-root user
USER appuser

# Expose ports
EXPOSE 8082 3005

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8082/health || exit 1

# Start script
CMD ["./start.sh"]
