dapr run \
    --app-id ai-svc \
    --app-port 3004 \
    --dapr-http-port 3503 \
    --dapr-grpc-port 50003 \
    --resources-path ../dapr/components.local \
    --placement-host-address localhost:50006 \
    --scheduler-host-address localhost:50007 \
    -- npm run dev
