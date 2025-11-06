# ArgoCD Deployment Guide for pubsub-mcp

This guide explains how to deploy the pubsub-mcp application stack to your local Minikube cluster using ArgoCD.

## Prerequisites

- Minikube running locally
- kubectl configured to point to your Minikube cluster
- ArgoCD installed on your cluster
- Docker or Podman for building images

## Architecture Overview

The pubsub-mcp stack consists of:

### Infrastructure Components

- **PostgreSQL**: State store for Dapr and application data
- **NATS JetStream**: Pub/sub messaging backbone
- **Dapr Placement**: Required for Dapr actors
- **Dapr Scheduler**: Required for Dapr workflows

### Application Services

- **ai-svc**: AI orchestration service with Dapr sidecar
- **readme-mcp**: MCP server for README standards enforcement with Dapr sidecar

## Installation Steps

### 1. Install ArgoCD

If you haven't already installed ArgoCD:

```bash
# Create the argocd namespace
kubectl create namespace argocd

# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD to be ready
kubectl wait --for=condition=available --timeout=300s deployment/argocd-server -n argocd
kubectl wait --for=condition=available --timeout=300s deployment/argocd-repo-server -n argocd

# Get the initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Port forward to access ArgoCD UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Access ArgoCD UI at <https://localhost:8080> with username `admin` and the password from above.

### 2. Configure Git Repository Access

Configure ArgoCD to access your private GitHub repository using SSH:

```bash
# Create a secret with your SSH key for GitHub authentication
kubectl create secret generic github-ssh-repo \
  -n argocd \
  --from-literal=type=git \
  --from-literal=url=git@github.com-personal:stiproot/pubsub-mcp.git \
  --from-file=sshPrivateKey=~/.ssh/id_ed25519

# Label it so ArgoCD recognizes it as a repository credential
kubectl label secret github-ssh-repo -n argocd argocd.argoproj.io/secret-type=repository
```

**Note:** Update the SSH key path to match your key location (commonly `~/.ssh/id_ed25519` or `~/.ssh/id_rsa`).

### 3. Deploy Applications

The deployment should be done in this order:

#### Step 1: Deploy Infrastructure

First, deploy the infrastructure components that the services depend on:

```bash
# Deploy PostgreSQL database
kubectl apply -f argocd/applications/postgres.yaml

# Deploy NATS with JetStream
kubectl apply -f argocd/applications/nats.yaml

# Deploy Dapr Placement service
kubectl apply -f argocd/applications/dapr-placement.yaml

# Deploy Dapr Scheduler service
kubectl apply -f argocd/applications/dapr-scheduler.yaml

# Trigger a refresh to start syncing immediately
kubectl patch application ai-mcp-postgres -n argocd --type merge -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"normal"}}}'
kubectl patch application nats -n argocd --type merge -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"normal"}}}'
kubectl patch application dapr-placement -n argocd --type merge -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"normal"}}}'
kubectl patch application dapr-scheduler -n argocd --type merge -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"normal"}}}'
```

Wait for infrastructure to be ready:

```bash
# Wait for PostgreSQL
kubectl wait --for=condition=ready pod -l app=ai-mcp-postgres -n pubsub-mcp --timeout=300s

# Wait for NATS
kubectl wait --for=condition=ready pod -l app=nats -n pubsub-mcp --timeout=300s

# Wait for Dapr services
kubectl wait --for=condition=available deployment/dapr-placement -n pubsub-mcp --timeout=300s
kubectl wait --for=condition=available deployment/dapr-scheduler -n pubsub-mcp --timeout=300s

# Verify infrastructure is running
kubectl get pods -n pubsub-mcp
kubectl get svc -n pubsub-mcp
```

#### Step 2: Deploy Dapr Runtime (Optional)

If you want the full Dapr control plane with operators, install Dapr using Helm:

```bash
# Install Dapr using the official method
helm repo add dapr https://dapr.github.io/helm-charts/
helm repo update
helm upgrade --install dapr dapr/dapr --namespace dapr-system --create-namespace --wait

# Wait for Dapr to be ready
kubectl wait --for=condition=available --timeout=300s deployment/dapr-operator -n dapr-system
kubectl wait --for=condition=available --timeout=300s deployment/dapr-sidecar-injector -n dapr-system
kubectl wait --for=condition=available --timeout=300s deployment/dapr-sentry -n dapr-system
```

**Note:** For local development with the lightweight Dapr deployment (just placement and scheduler), this step is optional. The Dapr sidecars will still work with the placement and scheduler services deployed in Step 1.

#### Step 3: Deploy Dapr Components

```bash
# Apply Dapr components (state stores, pub/sub)
kubectl apply -f argocd/applications/dapr-components.yaml

# Trigger a refresh to sync the components
kubectl patch application dapr-components -n argocd --type merge -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"normal"}}}'
```

This will create:

- `actor-statestore` - PostgreSQL state store for Dapr actors
- `ai-pubsub` - NATS JetStream pub/sub component

Wait for components to be created:

```bash
kubectl get components -n pubsub-mcp
```

#### Step 4: Build and Deploy Services

First, ensure your k8s manifests are committed and pushed to the repository:

```bash
# Add and commit the ArgoCD manifests if not already done
git add argocd/
git commit -m "Add ArgoCD deployment configuration"
git push origin main
```

Build the Docker images in Minikube's environment:

```bash
# Set docker env to use Minikube's Docker daemon
eval $(minikube docker-env)

# Build ai-svc image
cd src/ai-svc
docker build -t localhost/ai-svc:latest .

# Build readme-mcp image
cd ../mcps/readme-mcp
docker build -t localhost/readme-mcp:latest .

# Return to repo root
cd ../../..
```

**Important for Podman users:** When using Minikube with Podman, images built with `docker build` need to be explicitly loaded:

```bash
# Load the images into Minikube's container runtime
docker save localhost/ai-svc:latest | minikube image load -
docker save localhost/readme-mcp:latest | minikube image load -

# Verify the images are loaded
minikube ssh -- crictl images | grep -E "ai-svc|readme-mcp"
```

Deploy the services via ArgoCD:

```bash
# Deploy services
kubectl apply -f argocd/applications/ai-svc.yaml
kubectl apply -f argocd/applications/readme-mcp.yaml

# Trigger a refresh to start syncing immediately
kubectl patch application ai-svc -n argocd --type merge -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"normal"}}}'
kubectl patch application readme-mcp -n argocd --type merge -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"normal"}}}'
```

Wait for services to be ready:

```bash
# Check deployment status
kubectl get pods -n pubsub-mcp

# Wait for services to be ready
kubectl wait --for=condition=available deployment/ai-svc -n pubsub-mcp --timeout=300s
kubectl wait --for=condition=available deployment/readme-mcp -n pubsub-mcp --timeout=300s
```

### 4. Verify Deployment

```bash
# Check ArgoCD applications
kubectl get applications -n argocd

# Check all pods are running
kubectl get pods -n pubsub-mcp

# Check Dapr components
kubectl get components -n pubsub-mcp

# Check services
kubectl get svc -n pubsub-mcp
```

### 5. Access the Applications

The services are exposed via NodePort on the following ports:

- **ai-svc**: Port 30082
- **readme-mcp**: Port 30083

```bash
# Get Minikube IP
minikube ip

# Access the services
curl http://$(minikube ip):30082/health  # ai-svc
curl http://$(minikube ip):30083/health  # readme-mcp
```

Or use Minikube service:

```bash
minikube service ai-svc -n pubsub-mcp
minikube service readme-mcp -n pubsub-mcp
```

## Managing ArgoCD Auto-Sync

By default, all applications are configured with automated sync policies (`selfHeal: true`), which means ArgoCD will automatically revert any manual changes you make with kubectl back to what's in Git.

### Disabling Auto-Sync for Local Testing

To disable auto-sync so you can test with kubectl without ArgoCD reverting your changes:

```bash
# Disable auto-sync for services
kubectl patch app ai-svc -n argocd --type merge -p '{"spec":{"syncPolicy":{"automated":null}}}'
kubectl patch app readme-mcp -n argocd --type merge -p '{"spec":{"syncPolicy":{"automated":null}}}'
```

### Re-enabling Auto-Sync

When you're done testing:

```bash
# Re-enable auto-sync
kubectl patch app ai-svc -n argocd --type merge -p '{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'
kubectl patch app readme-mcp -n argocd --type merge -p '{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'
```

## Directory Structure

```txt
argocd/
├── applications/                       # ArgoCD Application manifests
│   ├── postgres.yaml                   # PostgreSQL application
│   ├── nats.yaml                       # NATS messaging application
│   ├── dapr-placement.yaml             # Dapr placement application
│   ├── dapr-scheduler.yaml             # Dapr scheduler application
│   ├── dapr-components.yaml            # Dapr components application
│   ├── ai-svc.yaml                     # AI service application
│   ├── readme-mcp.yaml                 # README MCP application
│   └── pubsub-mcp/                     # Service Kubernetes manifests
│       ├── ai-svc/                     # AI service k8s
│       │   ├── base/                   # Base Kubernetes manifests
│       │   │   ├── deployment.yaml
│       │   │   ├── service.yaml
│       │   │   ├── configmap.yaml
│       │   │   ├── secret.yaml
│       │   │   └── kustomization.yaml
│       │   └── overlays/
│       │       └── local/              # Local/Minikube overlay
│       │           ├── kustomization.yaml
│       │           └── secret-patch.yaml
│       └── readme-mcp/                 # README MCP service k8s
│           ├── base/                   # Base Kubernetes manifests
│           │   ├── deployment.yaml
│           │   ├── service.yaml
│           │   ├── configmap.yaml
│           │   ├── secret.yaml
│           │   └── kustomization.yaml
│           └── overlays/
│               └── local/              # Local/Minikube overlay
│                   ├── kustomization.yaml
│                   └── secret-patch.yaml
├── infrastructure/                     # Infrastructure component definitions
│   ├── postgres/                       # PostgreSQL
│   │   ├── statefulset.yaml
│   │   ├── service.yaml
│   │   └── kustomization.yaml
│   ├── nats/                           # NATS StatefulSet
│   │   ├── statefulset.yaml
│   │   ├── service.yaml
│   │   └── kustomization.yaml
│   ├── dapr-placement/                 # Dapr Placement
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── kustomization.yaml
│   └── dapr-scheduler/                 # Dapr Scheduler
│       ├── deployment.yaml
│       ├── service.yaml
│       └── kustomization.yaml
├── dapr-components/                    # Dapr component definitions
│   ├── postgres-secret.yaml
│   ├── actor-statestore.yaml
│   ├── ai-pubsub.yaml
│   └── kustomization.yaml
└── README.md
```

## Configuration

### Service Overview

| Service | Port (Nginx) | Port (App) | NodePort | Dapr Enabled | Description |
|---------|--------------|------------|----------|--------------|-------------|
| ai-svc | 8081 | 3004 | 30082 | ✓ | AI orchestration service with Dapr |
| readme-mcp | 8082 | 3005 | 30083 | ✓ | README MCP server with Dapr |

### Environment Variables

Environment variables are configured in the ConfigMaps and Secrets within each service's k8s manifests.

**ai-svc** (configured in the ConfigMap):

- `PORT`: Application port (3004)
- `NODE_ENV`: Environment (production)
- `DAPR_HOST`: Dapr sidecar host (127.0.0.1)
- `DAPR_HTTP_PORT`: Dapr HTTP port (3500)
- `NATS_URL`: NATS connection URL
- `PUBSUB_NAME`: Dapr pub/sub component name
- `STATE_STORE_NAME`: Dapr state store component name

**readme-mcp** (configured in the ConfigMap):

- Similar environment configuration with service-specific values

### Dapr Annotations

Services with Dapr enabled include these annotations:

- `dapr.io/enabled: "true"` - Enable Dapr sidecar injection
- `dapr.io/app-id: "<service-name>"` - Application ID for service discovery
- `dapr.io/app-port: "<port>"` - Port your application is listening on
- `dapr.io/enable-api-logging: "true"` - Enable API logging

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: "Repository not found" or "authentication required"

**Solution:**

Create a repository secret with your SSH key (see Step 2 above).

#### Issue 2: "app path does not exist"

This error occurs when the manifests haven't been committed to Git.

**Solution:**

```bash
git add argocd/
git commit -m "Add ArgoCD manifests"
git push origin main

# Trigger a refresh in ArgoCD
kubectl patch application ai-svc -n argocd --type merge -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"normal"}}}'
```

#### Issue 3: "ErrImagePull" - Cannot pull Docker image

**Solution:**

Build the image in Minikube's Docker environment:

```bash
# Set docker env to use Minikube's Docker daemon
eval $(minikube docker-env)

# Build the image
cd src/ai-svc
docker build -t localhost/ai-svc:latest .

# For Podman users, load the image
docker save localhost/ai-svc:latest | minikube image load -
```

#### Issue 4: Pods in CrashLoopBackOff

Check the logs:

```bash
# Check application logs
kubectl logs -n pubsub-mcp <pod-name> -c ai-svc

# Check Dapr sidecar logs
kubectl logs -n pubsub-mcp <pod-name> -c daprd
```

### Useful Commands

```bash
# Check ArgoCD application status
kubectl get applications -n argocd

# Get detailed application status
kubectl get application ai-svc -n argocd -o yaml

# View application logs
kubectl logs -n pubsub-mcp -l app=ai-svc -c ai-svc --tail=50

# View Dapr sidecar logs
kubectl logs -n pubsub-mcp -l app=ai-svc -c daprd --tail=50

# Restart a deployment
kubectl rollout restart deployment/ai-svc -n pubsub-mcp

# Check Dapr components
kubectl get components -n pubsub-mcp
kubectl describe component actor-statestore -n pubsub-mcp
```

## Next Steps

1. Configure secrets management (consider using Sealed Secrets or External Secrets Operator)
2. Set up monitoring and observability (Prometheus, Grafana, Jaeger)
3. Configure production environments with appropriate resource limits
4. Set up CI/CD pipelines for automated deployments
5. Implement backup strategies for PostgreSQL
