#!/bin/sh
set -e

# Ensure Nginx directories have correct permissions
mkdir -p /var/lib/nginx/tmp/client_body /var/lib/nginx/tmp/proxy /var/lib/nginx/tmp/fastcgi \
    /var/lib/nginx/tmp/uwsgi /var/lib/nginx/tmp/scgi /var/lib/nginx/logs

# Start PM2 in background
pm2 start ecosystem.config.cjs --no-daemon &

# Wait for Node app to be ready
sleep 2

# Start Nginx in foreground
exec nginx -g 'daemon off;'
