# ChittyOS API Gateway - Deployment Guide

## Pre-Deployment Checklist

### 1. ChittyAuth Configuration

- [ ] ChittyAuth service is deployed and operational
- [ ] Service URL is configured: `https://chittyauth-mcp-121.chittycorp-llc.workers.dev`
- [ ] Health check passes: `curl https://chittyauth-mcp-121.chittycorp-llc.workers.dev/health`

### 2. ChittyConnect × 1Password Setup

- [ ] 1Password CLI installed: `op --version`
- [ ] 1Password vault `ChittyOS-Secrets` exists
- [ ] Service account has access to vault
- [ ] All required credentials stored in vault:
  - `CHITTY_API_GATEWAY_SERVICE_TOKEN`
  - `CHITTY_NOTION_TOKEN` (if using Notion integration)
  - `CHITTY_STRIPE_SECRET_KEY` (if using Stripe)
  - `CHITTY_DOCUSIGN_ACCESS_TOKEN` (if using DocuSign)
  - `CHITTY_BLOCKCHAIN_RPC_URL` (if using blockchain)

### 3. Wrangler Configuration

- [ ] Wrangler installed: `wrangler --version`
- [ ] Authenticated with Cloudflare: `wrangler whoami`
- [ ] Account ID set in `wrangler.toml`: `0bc21e3a5a9de1a4cc843be9c3e98121`
- [ ] Worker name configured: `chittyos-api-gateway`

### 4. Secrets Management

- [ ] All secrets stored in Wrangler (see commands below)
- [ ] Secrets verified: `wrangler secret list`
- [ ] No hardcoded secrets in code

### 5. KV Namespace Setup

- [ ] KV namespace created for credential caching
- [ ] Namespace ID added to `wrangler.toml`
- [ ] Binding name: `KV_NAMESPACE`

## Deployment Steps

### Step 1: Store Secrets in Wrangler

```bash
# Service token for ChittyAuth
wrangler secret put CHITTY_SERVICE_TOKEN
# Enter the service token from 1Password: op://ChittyOS-Secrets/CHITTY_API_GATEWAY_SERVICE_TOKEN/password

# Third-party credentials (only if using these services)
wrangler secret put CHITTY_NOTION_TOKEN
wrangler secret put CHITTY_STRIPE_SECRET_KEY
wrangler secret put CHITTY_DOCUSIGN_ACCESS_TOKEN
wrangler secret put CHITTY_BLOCKCHAIN_RPC_URL
wrangler secret put CHITTY_CONTRACT_ADDRESS
```

### Step 2: Verify Secrets

```bash
# List all configured secrets
wrangler secret list

# Expected output:
# [
#   {
#     "name": "CHITTY_SERVICE_TOKEN",
#     "type": "secret_text"
#   },
#   {
#     "name": "CHITTY_NOTION_TOKEN",
#     "type": "secret_text"
#   }
# ]
```

### Step 3: Create KV Namespace (if not exists)

```bash
# Production namespace
wrangler kv:namespace create "KV_NAMESPACE"

# Copy the ID and add to wrangler.toml:
# [[kv_namespaces]]
# binding = "KV_NAMESPACE"
# id = "your_kv_namespace_id"
```

### Step 4: Deploy to Cloudflare

```bash
# Deploy to production
wrangler deploy

# Expected output:
# Total Upload: XX.XX KiB / gzip: XX.XX KiB
# Uploaded chittyos-api-gateway (X.XX sec)
# Published chittyos-api-gateway (X.XX sec)
#   https://chittyos-api-gateway.chittycorp-llc.workers.dev
# Current Deployment ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Step 5: Configure Custom Domain

```bash
# Add custom domain route via Cloudflare Dashboard
# Route: api.chitty.cc/*
# Worker: chittyos-api-gateway

# Or via wrangler:
wrangler route create api.chitty.cc/* chittyos-api-gateway
```

### Step 6: Verify Deployment

```bash
# Test health endpoint
curl https://api.chitty.cc/health
# Expected: OK

# Test status endpoint
curl https://api.chitty.cc/status
# Expected: {"status":"operational",...}

# Test authenticated endpoint (should fail without token)
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Content-Type: application/json" \
  -d '{"event_type":"test"}'
# Expected: 401 Unauthorized

# Test with valid token
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"deployment.verified","service":"api-gateway"}'
# Expected: 201 Created
```

## Post-Deployment Verification

### 1. Endpoint Testing

```bash
# Test all public endpoints
curl https://api.chitty.cc/health
curl https://api.chitty.cc/status
curl https://api.chitty.cc/chronicle/events?limit=5
curl https://api.chitty.cc/registry/packages

# Test authentication
TOKEN=$(curl -s -X POST https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/jwt/generate \
  -H "Content-Type: application/json" \
  -H "X-ChittyID: chitty_usr_test" \
  -d '{
    "expires_in": "5m",
    "claims": {"scopes": ["chronicle:write"]}
  }' | jq -r '.token')

curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"deployment.test","metadata":{"deployed_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}}'
```

### 2. CORS Verification

```bash
# Test CORS preflight
curl -X OPTIONS https://api.chitty.cc/chronicle/events \
  -H "Origin: https://chitty.cc" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization, Content-Type" \
  -v

# Expected headers in response:
# Access-Control-Allow-Origin: https://chitty.cc
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
# Access-Control-Allow-Headers: Content-Type, Authorization, X-ChittyID, X-Request-ID
```

### 3. Service Integration Testing

```bash
# Test ChittyAuth integration
curl -X POST https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/jwt/validate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"'$TOKEN'"}'

# Expected: {"valid":true,"chitty_id":"chitty_usr_test",...}
```

### 4. Error Handling Verification

```bash
# Test 401 response
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Content-Type: application/json" \
  -d '{"event_type":"test"}'

# Test 403 response (token with wrong scopes)
TOKEN_WRONG_SCOPE=$(curl -s -X POST https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/jwt/generate \
  -H "Content-Type: application/json" \
  -H "X-ChittyID: chitty_usr_test" \
  -d '{
    "expires_in": "5m",
    "claims": {"scopes": ["chronicle:read"]}
  }' | jq -r '.token')

curl -X POST https://api.chitty.cc/registry/api/packages/register \
  -H "Authorization: Bearer $TOKEN_WRONG_SCOPE" \
  -H "Content-Type: application/json" \
  -d '{"package_name":"test","version":"1.0.0","cert_id":"test"}'

# Expected: 403 Forbidden
```

## Monitoring & Observability

### 1. Cloudflare Analytics

Monitor in Cloudflare Dashboard:
- Request rate
- Error rate (4xx, 5xx)
- Latency (p50, p95, p99)
- Top endpoints
- Geographic distribution

### 2. Chronicle Audit Trail

```bash
# Check deployment events
curl https://api.chitty.cc/chronicle/events?type=deployment&limit=10

# Check authentication failures
curl https://api.chitty.cc/chronicle/events?type=auth.failure&limit=10
```

### 3. Log Monitoring

```bash
# Stream logs in real-time
wrangler tail

# Filter for errors
wrangler tail | grep -i error

# Filter for authentication
wrangler tail | grep -i auth
```

## Rollback Procedure

### If Deployment Fails

```bash
# List recent deployments
wrangler deployments list

# Rollback to previous deployment
wrangler rollback --deployment-id <previous-deployment-id>

# Verify rollback
curl https://api.chitty.cc/health
```

### If Secrets are Compromised

```bash
# Rotate service token
# 1. Generate new token in ChittyAuth
# 2. Store in 1Password
# 3. Update Wrangler secret
wrangler secret put CHITTY_SERVICE_TOKEN

# 4. Redeploy
wrangler deploy

# 5. Verify
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer NEW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"secret.rotated"}'
```

## Environment-Specific Configurations

### Staging Environment

```toml
# wrangler.staging.toml
name = "chittyos-api-gateway-staging"
main = "src/router.ts"
compatibility_date = "2024-09-28"
compatibility_flags = ["nodejs_compat"]
account_id = "0bc21e3a5a9de1a4cc843be9c3e98121"

[vars]
CHITTY_ID_SERVICE = "https://id-staging.chitty.cc"
CHITTYAUTH_URL = "https://chittyauth-staging.chittycorp-llc.workers.dev"
ENVIRONMENT = "staging"

[[kv_namespaces]]
binding = "KV_NAMESPACE"
id = "staging_kv_namespace_id"
```

Deploy to staging:
```bash
wrangler deploy --config wrangler.staging.toml
```

### Development Environment

```toml
# wrangler.dev.toml
name = "chittyos-api-gateway-dev"
main = "src/router.ts"
compatibility_date = "2024-09-28"
compatibility_flags = ["nodejs_compat"]

[vars]
CHITTY_ID_SERVICE = "http://localhost:8788"
CHITTYAUTH_URL = "http://localhost:8789"
ENVIRONMENT = "development"
```

Run locally:
```bash
wrangler dev --config wrangler.dev.toml --port 8787
```

## Credential Rotation Schedule

### Automated Rotation (Recommended)

```bash
#!/bin/bash
# rotate-credentials.sh

# Service tokens - rotate every 90 days
rotate_service_token() {
  echo "Rotating service token..."

  # Generate new token via ChittyAuth
  NEW_TOKEN=$(curl -s -X POST https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/service/tokens \
    -H "Content-Type: application/json" \
    -d '{"service":"api-gateway","expires_in":"90d"}' | jq -r '.token')

  # Store in 1Password
  op item edit "CHITTY_API_GATEWAY_SERVICE_TOKEN" password="$NEW_TOKEN"

  # Update Wrangler secret
  echo "$NEW_TOKEN" | wrangler secret put CHITTY_SERVICE_TOKEN

  # Deploy
  wrangler deploy

  echo "Service token rotated successfully"
}

# API keys - rotate every 180 days
rotate_api_keys() {
  echo "Rotating API keys..."
  # Implementation specific to each service
}

# Execute rotation
rotate_service_token
rotate_api_keys
```

### Manual Rotation

1. Generate new credential
2. Store in 1Password: `op item edit CREDENTIAL_NAME password="NEW_VALUE"`
3. Update Wrangler: `wrangler secret put CHITTY_CREDENTIAL_NAME`
4. Deploy: `wrangler deploy`
5. Verify: Test authenticated endpoints
6. Archive old credential in 1Password

## Troubleshooting

### Issue: 401 Unauthorized on all requests

**Diagnosis:**
```bash
# Check if service token is set
wrangler secret list | grep CHITTY_SERVICE_TOKEN

# Test ChittyAuth directly
curl https://chittyauth-mcp-121.chittycorp-llc.workers.dev/health
```

**Solution:**
```bash
# Re-add service token
wrangler secret put CHITTY_SERVICE_TOKEN
wrangler deploy
```

### Issue: CORS errors in browser

**Diagnosis:**
```bash
# Check CORS headers
curl -X OPTIONS https://api.chitty.cc/chronicle/events \
  -H "Origin: https://your-app.com" \
  -v
```

**Solution:**
Add your origin to the whitelist in `src/router.ts`:
```typescript
const allowedOrigins = [
  "https://chitty.cc",
  "https://your-app.com", // Add this
  // ...
];
```

### Issue: 500 Internal Server Error

**Diagnosis:**
```bash
# Check logs
wrangler tail --format=pretty

# Look for error stack traces
```

**Solution:**
- Check if all required environment variables are set
- Verify KV namespace is bound
- Check ChittyAuth service availability

## Security Considerations

### Pre-Production Security Checklist

- [ ] No secrets in code or logs
- [ ] All secrets stored in Wrangler
- [ ] Service tokens have minimal scopes
- [ ] CORS whitelist configured (no wildcards)
- [ ] Rate limiting configured
- [ ] HTTPS only (no HTTP)
- [ ] Authentication required for write operations
- [ ] Audit logging enabled via Chronicle

### Production Security Monitoring

- [ ] Monitor failed authentication attempts
- [ ] Alert on unusual traffic patterns
- [ ] Review Chronicle audit trail weekly
- [ ] Rotate credentials on schedule
- [ ] Review CORS whitelist monthly

## Maintenance

### Weekly Tasks

- Review Chronicle audit logs
- Check error rates in Cloudflare Analytics
- Verify credential rotation schedule

### Monthly Tasks

- Review and update CORS whitelist
- Audit service token scopes
- Test disaster recovery procedures
- Update dependencies

### Quarterly Tasks

- Rotate service tokens
- Security audit
- Performance optimization review
- Documentation updates

---

**Generated with ChittyOS API Gateway v1.0.0**
**Last Updated:** 2025-11-15
