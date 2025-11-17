# ChittyOS Get - Service Onboarding

**Endpoint:** `https://get.chitty.cc`

Automated service onboarding and provisioning for the ChittyOS ecosystem.

## What It Does

When you onboard a new service via `get.chitty.cc`, it automatically:

1. ✅ **Mints a ChittyID** for your service (namespace: `SRV`)
2. ✅ **Generates a service token** from ChittyAuth with required scopes
3. ✅ **Registers your service** with the ChittyOS ecosystem
4. ✅ **Logs onboarding event** to Chronicle for audit trail
5. ✅ **Returns complete configuration** ready to paste into your project

## Usage

### Onboard a New Service

```bash
curl -X POST https://get.chitty.cc/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "service_name": "my-awesome-service",
    "service_type": "cloudflare_worker",
    "description": "My service that does amazing things",
    "endpoints": ["/api/v1/data", "/api/v1/process"],
    "required_scopes": ["chronicle:write", "registry:read"],
    "dependencies": ["ChittyAuth", "ChittyID"],
    "metadata": {
      "team": "platform",
      "tier": "production"
    }
  }'
```

### Response

```json
{
  "success": true,
  "chitty_id": "did:chitty:01-SRV-XXX-XXXX-X-XX-X-X",
  "service_token": "svc_abc123xyz789...",
  "configuration": {
    "env_vars": {
      "CHITTY_SERVICE_ID": "did:chitty:01-SRV-XXX-XXXX-X-XX-X-X",
      "CHITTY_SERVICE_TOKEN": "svc_abc123xyz789...",
      "CHITTYAUTH_URL": "https://chittyauth-mcp-121.chittycorp-llc.workers.dev",
      "CHITTYID_URL": "https://id.chitty.cc"
    },
    "wrangler_snippet": "# Add to your wrangler.toml\n[vars]\nCHITTY_SERVICE_ID = \"...\"\n...",
    "next_steps": [
      "1. Add CHITTY_SERVICE_ID to your wrangler.toml [vars] section",
      "2. Run: wrangler secret put CHITTY_SERVICE_TOKEN",
      "3. Integrate ChittyAuth middleware",
      "4. Test authentication",
      "5. Deploy your service",
      "6. Verify at: https://registry.chitty.cc/services/my-awesome-service"
    ]
  },
  "registration": {
    "registered_at": "2025-11-17T12:00:00.000Z",
    "registry_url": "https://registry.chitty.cc/services/my-awesome-service",
    "chronicle_event_id": "evt_20251117120000_abc123"
  }
}
```

## Service Types

- `cloudflare_worker` - Cloudflare Workers edge services
- `api_service` - Backend API services (Node.js, Python, etc.)
- `mcp_server` - Model Context Protocol servers
- `frontend_app` - Web applications (React, Vue, etc.)

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `service_name` | string | Unique service name (lowercase, hyphens allowed) |
| `service_type` | string | One of: cloudflare_worker, api_service, mcp_server, frontend_app |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Human-readable service description |
| `endpoints` | string[] | API endpoints exposed by this service |
| `required_scopes` | string[] | OAuth scopes needed (e.g., "chronicle:write") |
| `dependencies` | string[] | Other ChittyOS services this depends on |
| `metadata` | object | Additional metadata (team, tier, etc.) |

## Integration Steps

After onboarding:

### 1. Update wrangler.toml

```toml
[vars]
CHITTY_SERVICE_ID = "did:chitty:01-SRV-XXX-XXXX-X-XX-X-X"
CHITTYAUTH_URL = "https://chittyauth-mcp-121.chittycorp-llc.workers.dev"
```

### 2. Set Service Token Secret

```bash
wrangler secret put CHITTY_SERVICE_TOKEN
# Paste the token from the onboard response
```

### 3. Integrate Auth Middleware

See `chittyos-api-gateway/src/middleware/auth.ts` for example.

```typescript
import { requireAuth } from "./middleware/auth";

// In your fetch handler:
const { response, authContext } = await requireAuth(request, env);
if (response) return response;

// Now you have authenticated context with ChittyID
console.log(`Request from: ${authContext.chittyId}`);
```

### 4. Deploy

```bash
wrangler deploy
```

## Deployment

```bash
# Deploy get.chitty.cc
cd chittyos-get
wrangler deploy

# Configure route in Cloudflare Dashboard:
# - Pattern: get.chitty.cc/*
# - Zone: chitty.cc
# - Worker: chittyos-get
```

## Environment Setup

Before deploying, you need:

1. **ChittyID for get.chitty.cc itself**
   ```bash
   # Mint via id.chitty.cc (chicken-and-egg: use manual process first)
   ```

2. **Service token for get.chitty.cc**
   ```bash
   wrangler secret put CHITTY_SERVICE_TOKEN
   wrangler secret put CHITTY_SERVICE_ID
   ```

## Health Check

```bash
curl https://get.chitty.cc/health
# Should return: OK
```

## API Documentation

```bash
curl https://get.chitty.cc/
# Returns service info and example usage
```

## Security

- All onboarding requests are logged to Chronicle
- Generated service tokens have 365-day expiration
- Tokens include only requested scopes plus auth:validate, auth:check
- ChittyID minting is authenticated via get.chitty.cc's own service token

## Troubleshooting

### "Failed to provision ChittyID"
- Check that id.chitty.cc is accessible
- Verify CHITTY_SERVICE_TOKEN has chittyid:mint scope

### "Failed to generate service token"
- Check that ChittyAuth is accessible
- Verify CHITTY_SERVICE_TOKEN has auth:token:create scope

### "Service registration failed"
- ChittyRegistry might be down or misconfigured
- This is non-fatal; service will still work without registry listing

## Example: Onboard API Gateway (If it wasn't already done)

```bash
curl -X POST https://get.chitty.cc/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "service_name": "chittyos-api-gateway",
    "service_type": "cloudflare_worker",
    "description": "Central API routing gateway for Chronicle, Quality, and Registry services",
    "endpoints": ["/chronicle/*", "/quality/*", "/registry/*", "/health", "/api/v1/status"],
    "required_scopes": ["chronicle:write", "registry:write", "quality:write"],
    "dependencies": ["ChittyAuth", "ChittyConnect", "ChittyID"],
    "metadata": {
      "criticality": "high",
      "team": "platform",
      "tier": "production"
    }
  }'
```

---

**Status:** Ready for deployment after setting secrets
