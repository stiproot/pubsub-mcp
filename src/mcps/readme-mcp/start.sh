#!/bin/sh
set -e

echo "Starting MCP Server Service..."

# Create log directories
mkdir -p /var/log/pm2

# Start Nginx in the background
echo "Starting Nginx..."
nginx

# Start the Node.js application with PM2
echo "Starting Node.js application with PM2..."
pm2-runtime start ecosystem.config.cjs
