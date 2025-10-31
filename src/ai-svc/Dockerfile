# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy and install Netskope certificate
COPY nscacert.pem /usr/local/share/ca-certificates/nscacert.crt
RUN apk add --no-cache ca-certificates && \
    cat /usr/local/share/ca-certificates/nscacert.crt >> /etc/ssl/certs/ca-certificates.crt && \
    update-ca-certificates

# Set NODE_EXTRA_CA_CERTS to use the certificate
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:24-alpine

# Copy and install Netskope certificate
COPY nscacert.pem /usr/local/share/ca-certificates/nscacert.crt
RUN apk add --no-cache ca-certificates && \
    cat /usr/local/share/ca-certificates/nscacert.crt >> /etc/ssl/certs/ca-certificates.crt && \
    update-ca-certificates

# Set NODE_EXTRA_CA_CERTS to use the certificate
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# Install PM2 and Nginx
RUN apk add --no-cache nginx && \
    npm install -g pm2

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy PM2 ecosystem file
COPY ecosystem.config.cjs ./

# Set up Nginx directories and permissions
RUN mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp /var/cache/nginx/scgi_temp /var/run/nginx /run/nginx \
    /var/lib/nginx/tmp/client_body /var/lib/nginx/tmp/proxy /var/lib/nginx/tmp/fastcgi \
    /var/lib/nginx/tmp/uwsgi /var/lib/nginx/tmp/scgi /var/lib/nginx/logs && \
    touch /var/run/nginx.pid && \
    chown -R node:node /app /var/cache/nginx /var/run/nginx.pid /var/log/nginx /run/nginx \
    /var/lib/nginx && \
    chmod -R 755 /var/cache/nginx /var/log/nginx /var/lib/nginx

# Add custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/conf.d/default.conf

# Ensure permissions are set correctly after all setup
RUN chown -R node:node /var/cache/nginx /var/run/nginx.pid /var/log/nginx /run/nginx /var/lib/nginx

# Copy startup script
COPY --chown=node:node start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Expose ports (8081 for Nginx, 3002 for Node app internally)
EXPOSE 8081

# Switch to node user
USER node

# Start both Nginx and the Node app with PM2
CMD ["/app/start.sh"]
