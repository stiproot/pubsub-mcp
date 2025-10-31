#!/bin/bash

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Run with Dapr sidecar
dapr run \
  --app-id readme-mcp \
  --app-port 3005 \
  --dapr-http-port 3500 \
  --dapr-grpc-port 50001 \
  --log-level info \
  --enable-api-logging \
  -- npm run dev
