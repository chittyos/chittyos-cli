# ChittyConnect × 1Password Integration Guide

## Overview

This guide establishes secure credential management for ChittyOS certificate-based NPM publishing infrastructure using ChittyConnect × 1Password integration with zero-trust principles.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    1Password Vaults                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ ChittyOS-Core    │  │ ChittyOS-Deploy  │  │ ChittyConnect │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                   ChittyConnect Secret Manager                   │
│  • Credential provisioning        • Secret rotation              │
│  • GitHub Actions integration     • Wrangler secret sync         │
│  • Service token management       • Zero-trust verification      │
└─────────────────────────────────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ↓                     ↓
        ┌──────────────────┐  ┌──────────────────────┐
        │  GitHub Secrets  │  │  Cloudflare Workers  │
        │  (Actions)       │  │  (Wrangler Secrets)  │
        └──────────────────┘  └──────────────────────┘
```

## Service Authentication Matrix

| From Service       | To Service        | Auth Method      | Secret Name                    | Scopes                        |
|-------------------|-------------------|------------------|--------------------------------|-------------------------------|
| API Gateway       | ChittyID Server   | Service Token    | CHITTY_ID_SERVICE_TOKEN        | certificate:issue,verify      |
| API Gateway       | ChittyAuth        | Service Token    | CHITTY_SERVICE_TOKEN           | auth:validate,permission:check|
| GitHub Actions    | ChittyID Server   | API Key          | CHITTY_ID_TOKEN                | certificate:request           |
| GitHub Actions    | API Gateway       | API Key          | CHITTY_API_KEY                 | chronicle:write,registry:write|
| GitHub Actions    | Registry          | Service Token    | CHITTY_REGISTRY_TOKEN          | registry:write,package:publish|
| GitHub Actions    | Cloudflare R2     | API Token        | CLOUDFLARE_API_TOKEN           | r2:write                      |
| GitHub Actions    | NPM Registry      | Auth Token       | NPM_TOKEN                      | package:publish               |

## 1Password Vault Structure

### ChittyOS-Core Vault
**Purpose**: Core infrastructure secrets and service-to-service authentication

```
ChittyOS-Core/
├── CHITTY_API_GATEWAY_SERVICE_TOKEN        # API Gateway → ChittyAuth
├── CHITTY_ID_SERVICE_TOKEN                 # API Gateway → ChittyID
├── CHITTY_SERVICE_MASTER_KEY               # Encryption key for service tokens
├── CHITTY_DATABASE_URL                     # Shared database connection
└── CHITTY_KV_ENCRYPTION_KEY                # KV namespace encryption
```

### ChittyOS-Deployment Vault
**Purpose**: Deployment and CI/CD credentials

```
ChittyOS-Deployment/
├── CLOUDFLARE_API_TOKEN                    # Cloudflare Workers/R2 access
├── CLOUDFLARE_ACCOUNT_ID                   # Account: 0bc21e3a5a9de1a4cc843be9c3e98121
├── NPM_TOKEN                               # NPM registry publishing
├── GITHUB_TOKEN                            # GitHub API access
└── WRANGLER_DEPLOY_TOKEN                   # Automated deployment token
```

### ChittyConnect Only Vault
**Purpose**: Third-party service proxies and external integrations

```
ChittyConnect/
├── CHITTY_NOTION_TOKEN                     # Notion API proxy
├── CHITTY_STRIPE_SECRET_KEY                # Stripe payment processing
├── CHITTY_DOCUSIGN_ACCESS_TOKEN            # DocuSign e-signature
├── CHITTY_BLOCKCHAIN_RPC_URL               # Blockchain RPC endpoint
├── CHITTY_CONTRACT_ADDRESS                 # Smart contract address
└── CHITTY_OPENAI_API_KEY                   # OpenAI API proxy
```

### GitHub Actions Secrets Vault
**Purpose**: Secrets specifically for npm-publish-certified.yml workflow

```
GitHub-Actions-NPM-Publishing/
├── CHITTY_ID_TOKEN                         # Certificate issuance
├── CHITTY_API_KEY                          # Chronicle/Registry access
├── CHITTY_REGISTRY_TOKEN                   # Package registration
├── CLOUDFLARE_API_TOKEN                    # R2 uploads
├── CLOUDFLARE_ACCOUNT_ID                   # Cloudflare account
└── NPM_TOKEN                               # NPM publish
```

## Setup Instructions

### Step 1: Initialize 1Password Vault Structure

```bash
#!/bin/bash
# Create vault structure for ChittyOS secrets

# Check if vaults exist, create if needed
op vault get "ChittyOS-Core" 2>/dev/null || \
  op vault create "ChittyOS-Core" --description="Core ChittyOS infrastructure secrets"

op vault get "ChittyOS-Deployment" 2>/dev/null || \
  op vault create "ChittyOS-Deployment" --description="Deployment and CI/CD credentials"

op vault get "ChittyConnect" 2>/dev/null || \
  echo "Using existing ChittyConnect Only vault"

# Verify vault access
echo "Verifying vault access..."
op vault list | grep -E "ChittyOS-Core|ChittyOS-Deployment|ChittyConnect"
```

### Step 2: Generate Service Authentication Tokens

#### 2.1 API Gateway Service Token (API Gateway → ChittyAuth)

```bash
# Generate secure service token using OpenSSL
CHITTY_SERVICE_TOKEN="svc_$(openssl rand -hex 32)"

# Store in 1Password
op item create \
  --category=password \
  --title="CHITTY_API_GATEWAY_SERVICE_TOKEN" \
  --vault="ChittyOS-Core" \
  --tags="service-token,api-gateway,chittyauth" \
  password="$CHITTY_SERVICE_TOKEN" \
  notes="Service token for API Gateway to ChittyAuth authentication. Scopes: auth:validate, permission:check. Rotation: 90 days."

echo "✓ API Gateway service token stored in 1Password"
```

#### 2.2 ChittyID Service Token (API Gateway → ChittyID)

```bash
# Generate ChittyID service token
CHITTY_ID_SERVICE_TOKEN="svc_$(openssl rand -hex 32)"

# Store in 1Password
op item create \
  --category=password \
  --title="CHITTY_ID_SERVICE_TOKEN" \
  --vault="ChittyOS-Core" \
  --tags="service-token,chittyid,certificate" \
  password="$CHITTY_ID_SERVICE_TOKEN" \
  notes="Service token for API Gateway to ChittyID certificate operations. Scopes: certificate:issue, certificate:verify. Rotation: 90 days."

echo "✓ ChittyID service token stored in 1Password"
```

#### 2.3 GitHub Actions API Tokens

```bash
# GitHub Actions → ChittyID (certificate requests)
CHITTY_ID_TOKEN="chitty_$(openssl rand -hex 24)_$(date +%s)"

op item create \
  --category=password \
  --title="CHITTY_ID_TOKEN" \
  --vault="ChittyOS-Deployment" \
  --tags="github-actions,chittyid,api-key" \
  password="$CHITTY_ID_TOKEN" \
  notes="API key for GitHub Actions to request ChittyID certificates. Scopes: certificate:request. Used in npm-publish-certified.yml workflow."

# GitHub Actions → API Gateway (Chronicle/Registry)
CHITTY_API_KEY="chitty_api_$(openssl rand -hex 24)_$(date +%s)"

op item create \
  --category=password \
  --title="CHITTY_API_KEY" \
  --vault="ChittyOS-Deployment" \
  --tags="github-actions,api-gateway,chronicle,registry" \
  password="$CHITTY_API_KEY" \
  notes="API key for GitHub Actions to access Chronicle and Registry services. Scopes: chronicle:write, registry:write."

# GitHub Actions → Registry (package registration)
CHITTY_REGISTRY_TOKEN="reg_$(openssl rand -hex 32)"

op item create \
  --category=password \
  --title="CHITTY_REGISTRY_TOKEN" \
  --vault="ChittyOS-Deployment" \
  --tags="github-actions,registry,package" \
  password="$CHITTY_REGISTRY_TOKEN" \
  notes="Service token for GitHub Actions to register packages. Scopes: registry:write, package:publish."

echo "✓ GitHub Actions tokens stored in 1Password"
```

### Step 3: Store Existing Cloudflare & NPM Credentials

```bash
# Cloudflare API Token (must have R2 write + Workers deploy permissions)
# Obtain from: https://dash.cloudflare.com/profile/api-tokens
read -sp "Enter CLOUDFLARE_API_TOKEN: " CLOUDFLARE_API_TOKEN
echo

op item create \
  --category=password \
  --title="CLOUDFLARE_API_TOKEN" \
  --vault="ChittyOS-Deployment" \
  --tags="cloudflare,r2,workers,deployment" \
  password="$CLOUDFLARE_API_TOKEN" \
  notes="Cloudflare API token with R2 object write and Workers deploy permissions. Used for package storage and service deployment."

# Cloudflare Account ID (static value)
op item create \
  --category=password \
  --title="CLOUDFLARE_ACCOUNT_ID" \
  --vault="ChittyOS-Deployment" \
  --tags="cloudflare,account" \
  password="0bc21e3a5a9de1a4cc843be9c3e98121" \
  notes="Cloudflare account ID for ChittyOS organization."

# NPM Token (obtain from: https://www.npmjs.com/settings/[username]/tokens)
read -sp "Enter NPM_TOKEN: " NPM_TOKEN
echo

op item create \
  --category=password \
  --title="NPM_TOKEN" \
  --vault="ChittyOS-Deployment" \
  --tags="npm,publishing,package" \
  password="$NPM_TOKEN" \
  notes="NPM authentication token for publishing ChittyOS packages. Automation token with publish scope."

echo "✓ Cloudflare and NPM credentials stored in 1Password"
```

### Step 4: Provision GitHub Repository Secrets

```bash
#!/bin/bash
# Provision secrets to GitHub repository using 1Password + GitHub CLI

REPO="chittyos/cli"

echo "Provisioning GitHub secrets for $REPO..."

# Retrieve secrets from 1Password and set in GitHub
gh secret set CHITTY_ID_TOKEN \
  --repo="$REPO" \
  --body="$(op item get 'CHITTY_ID_TOKEN' --vault='ChittyOS-Deployment' --fields password)"

gh secret set CHITTY_API_KEY \
  --repo="$REPO" \
  --body="$(op item get 'CHITTY_API_KEY' --vault='ChittyOS-Deployment' --fields password)"

gh secret set CHITTY_REGISTRY_TOKEN \
  --repo="$REPO" \
  --body="$(op item get 'CHITTY_REGISTRY_TOKEN' --vault='ChittyOS-Deployment' --fields password)"

gh secret set CLOUDFLARE_API_TOKEN \
  --repo="$REPO" \
  --body="$(op item get 'CLOUDFLARE_API_TOKEN' --vault='ChittyOS-Deployment' --fields password)"

gh secret set CLOUDFLARE_ACCOUNT_ID \
  --repo="$REPO" \
  --body="$(op item get 'CLOUDFLARE_ACCOUNT_ID' --vault='ChittyOS-Deployment' --fields password)"

gh secret set NPM_TOKEN \
  --repo="$REPO" \
  --body="$(op item get 'NPM_TOKEN' --vault='ChittyOS-Deployment' --fields password)"

echo "✓ GitHub secrets provisioned successfully"

# Verify secrets were set
echo ""
echo "Verifying GitHub secrets..."
gh secret list --repo="$REPO"
```

### Step 5: Configure Wrangler Secrets for API Gateway

```bash
#!/bin/bash
# Set Wrangler secrets for API Gateway from 1Password

cd /Users/nb/chittyos/dev/cli/chittyos-api-gateway

echo "Configuring Wrangler secrets for API Gateway..."

# Set service-to-service authentication tokens
op item get 'CHITTY_API_GATEWAY_SERVICE_TOKEN' \
  --vault='ChittyOS-Core' \
  --fields password | \
  wrangler secret put CHITTY_SERVICE_TOKEN

op item get 'CHITTY_ID_SERVICE_TOKEN' \
  --vault='ChittyOS-Core' \
  --fields password | \
  wrangler secret put CHITTY_ID_SERVICE_TOKEN

# Set third-party service credentials (ChittyConnect proxies)
op item get 'CHITTY_NOTION_TOKEN' \
  --vault='ChittyConnect' \
  --fields password | \
  wrangler secret put CHITTY_NOTION_TOKEN

op item get 'CHITTY_STRIPE_SECRET_KEY' \
  --vault='ChittyConnect' \
  --fields password | \
  wrangler secret put CHITTY_STRIPE_SECRET_KEY

echo "✓ Wrangler secrets configured successfully"

# Verify secrets are set
echo ""
echo "Verifying Wrangler secrets..."
wrangler secret list
```

## Service Registration in ChittyAuth

After generating service tokens, register them in ChittyAuth service:

### Register API Gateway Service

```bash
# Register API Gateway as a trusted service in ChittyAuth
curl -X POST "https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/service/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(op item get 'CHITTY_ADMIN_TOKEN' --vault='ChittyOS-Core' --fields password)" \
  -d '{
    "service_id": "chittyos.api-gateway",
    "service_name": "ChittyOS API Gateway",
    "service_token_hash": "'$(echo -n "$(op item get 'CHITTY_API_GATEWAY_SERVICE_TOKEN' --vault='ChittyOS-Core' --fields password)" | sha256sum | cut -d' ' -f1)'",
    "scopes": ["auth:validate", "permission:check", "service:status"],
    "allowed_origins": [
      "https://api.chitty.cc",
      "https://chittyos-api-gateway.ccorp.workers.dev"
    ],
    "rotation_interval_days": 90,
    "metadata": {
      "environment": "production",
      "deployed_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "owner": "ChittyOS Infrastructure Team"
    }
  }'
```

### Register ChittyID Service Authentication

```bash
# Register API Gateway's access to ChittyID service
curl -X POST "https://id.chitty.cc/v1/service/authorize" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $(op item get 'CHITTY_ID_ADMIN_KEY' --vault='ChittyOS-Core' --fields password)" \
  -d '{
    "service_id": "chittyos.api-gateway",
    "service_token_hash": "'$(echo -n "$(op item get 'CHITTY_ID_SERVICE_TOKEN' --vault='ChittyOS-Core' --fields password)" | sha256sum | cut -d' ' -f1)'",
    "scopes": ["certificate:issue", "certificate:verify", "certificate:list"],
    "rate_limit": {
      "requests_per_minute": 100,
      "burst": 20
    },
    "expires_at": "'$(date -u -d '+90 days' +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

## Zero-Trust Authentication Flows

### Flow 1: GitHub Actions → ChittyID (Certificate Request)

```
┌─────────────────┐
│ GitHub Actions  │
│ (npm-publish)   │
└────────┬────────┘
         │ POST /v1/certificates/issue
         │ Authorization: Bearer {CHITTY_ID_TOKEN}
         │ X-API-Key: {CHITTY_API_KEY}
         ↓
┌─────────────────┐
│ ChittyID Server │ 1. Validate API key against database
│ (id.chitty.cc)  │ 2. Check certificate:request scope
└────────┬────────┘ 3. Verify requester identity (GitHub actor)
         │           4. Issue certificate with ChittyID
         ↓
┌─────────────────┐
│   Certificate   │ • cert_id
│   Response      │ • chitty_id
└─────────────────┘ • pem, private_key, public_key
```

### Flow 2: GitHub Actions → API Gateway (Chronicle Event)

```
┌─────────────────┐
│ GitHub Actions  │
└────────┬────────┘
         │ POST /chronicle/events
         │ Authorization: Bearer {CHITTY_API_KEY}
         ↓
┌─────────────────┐
│  API Gateway    │ 1. Extract Bearer token
│  Middleware     │ 2. Detect token type (apikey)
└────────┬────────┘ 3. Call ChittyAuth validation
         ↓
┌─────────────────┐
│   ChittyAuth    │ 1. Hash API key (SHA-256)
│   Validation    │ 2. Lookup in database
└────────┬────────┘ 3. Verify active + not expired
         │           4. Return scopes + ChittyID
         ↓
┌─────────────────┐
│  Chronicle      │ 1. Verify chronicle:write scope
│  Handler        │ 2. Record event with authenticated ChittyID
└─────────────────┘ 3. Return event_id and chronicle_url
```

### Flow 3: API Gateway → ChittyID (Service-to-Service)

```
┌─────────────────┐
│  API Gateway    │
│  (Proxy Call)   │
└────────┬────────┘
         │ POST /v1/certificates/verify
         │ Authorization: Bearer {CHITTY_ID_SERVICE_TOKEN}
         │ X-Request-ID: {uuid}
         │ X-Source-Service: api-gateway
         ↓
┌─────────────────┐
│ ChittyID Server │ 1. Extract service token (svc_ prefix)
│                 │ 2. Hash token (SHA-256)
└────────┬────────┘ 3. Lookup in service_tokens table
         │           4. Verify scopes include certificate:verify
         ↓
┌─────────────────┐
│  Certificate    │ • valid: true
│  Verification   │ • issued_to: {chittyId}
└─────────────────┘ • expires_at: {timestamp}
```

## Credential Rotation Schedule

| Credential Type      | Rotation Interval | Automation Status | Process                          |
|---------------------|-------------------|-------------------|----------------------------------|
| Service Tokens      | 90 days           | Manual            | Generate → Store in 1Password → Update Wrangler → Redeploy |
| API Keys            | 180 days          | Semi-automated    | Generate → Update GitHub Secrets via `gh` CLI |
| NPM Token           | 365 days          | Manual            | Regenerate in NPM → Update 1Password → Update GitHub |
| Cloudflare Token    | As needed         | Manual            | Regenerate in dashboard → Update 1Password → Update GitHub |
| Database Credentials| 90 days           | Not implemented   | Requires coordinated rotation across all services |

## Validation Steps

### 1. Verify 1Password Secret Storage

```bash
# Check all required secrets are stored
op item list --vault="ChittyOS-Core" --tags="service-token"
op item list --vault="ChittyOS-Deployment" --tags="github-actions"
op item list --vault="ChittyConnect" --tags="api-key"
```

### 2. Verify GitHub Secrets

```bash
cd /Users/nb/chittyos/dev/cli
gh secret list --repo="chittyos/cli"

# Expected output:
# CHITTY_API_KEY
# CHITTY_ID_TOKEN
# CHITTY_REGISTRY_TOKEN
# CLOUDFLARE_API_TOKEN
# CLOUDFLARE_ACCOUNT_ID
# NPM_TOKEN
```

### 3. Verify Wrangler Secrets

```bash
cd /Users/nb/chittyos/dev/cli/chittyos-api-gateway
wrangler secret list

# Expected output:
# CHITTY_SERVICE_TOKEN
# CHITTY_ID_SERVICE_TOKEN
# CHITTY_NOTION_TOKEN
# CHITTY_STRIPE_SECRET_KEY
```

### 4. Test Service-to-Service Authentication

```bash
# Test API Gateway → ChittyAuth connection
curl -X GET "https://chittyos-api-gateway.ccorp.workers.dev/api/v1/status" | jq .

# Test GitHub Actions credential (use from local)
curl -X POST "https://id.chitty.cc/v1/certificates/issue" \
  -H "Authorization: Bearer $(op item get 'CHITTY_ID_TOKEN' --vault='ChittyOS-Deployment' --fields password)" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "test",
    "package_name": "@chittyos/test",
    "version": "0.0.1",
    "requester": {
      "test": true
    }
  }'

# Expected: 200 OK with certificate data OR 401 if endpoint requires additional setup
```

### 5. Test NPM Publishing Workflow

```bash
# Trigger workflow dispatch for a test package
cd /Users/nb/chittyos/dev/cli
gh workflow run npm-publish-certified.yml \
  --ref main \
  -f package_path="chittyos-executive-mcp"

# Monitor workflow execution
gh run watch
```

## Security Best Practices

### 1. Secret Never Touches Disk
```bash
# GOOD: Pipe directly from 1Password to wrangler
op item get 'SECRET' --fields password | wrangler secret put SECRET_NAME

# BAD: Write to file first (leaves forensic traces)
op item get 'SECRET' --fields password > /tmp/secret.txt
wrangler secret put SECRET_NAME < /tmp/secret.txt
```

### 2. Service Token Verification
```bash
# Always hash service tokens before database lookup
TOKEN_HASH=$(echo -n "$SERVICE_TOKEN" | sha256sum | cut -d' ' -f1)

# Verify expiration in database query
SELECT * FROM service_tokens
WHERE token_hash = '$TOKEN_HASH'
  AND status = 'active'
  AND expires_at > NOW()
```

### 3. Scope-Based Authorization
```typescript
// Check specific scopes before allowing operations
if (!authContext.scopes?.includes('certificate:issue')) {
  return new Response('Forbidden: Insufficient permissions', { status: 403 });
}
```

### 4. Audit Logging
```typescript
// Log all authenticated requests with ChittyID
await env.KV_NAMESPACE.put(
  `audit:${Date.now()}:${crypto.randomUUID()}`,
  JSON.stringify({
    timestamp: new Date().toISOString(),
    actor: authContext.chittyId,
    action: 'certificate:issue',
    resource: certificateId,
    outcome: 'success',
    ip: request.headers.get('CF-Connecting-IP'),
  }),
  { expirationTtl: 7776000 } // 90 days
);
```

## Enhancement Opportunities

### Gap 1: Manual Token Rotation
**Current**: Service tokens manually generated and rotated every 90 days
**Proposal**: Automated rotation via ChittyConnect cron job
**Impact**: Reduced human error, improved security posture
**Implementation**:
```typescript
// Scheduled worker in ChittyConnect
async scheduled(event: ScheduledEvent) {
  if (event.cron === '0 0 1 */3 *') { // Every 3 months
    await rotateServiceTokens();
  }
}
```

### Gap 2: No Centralized Secret Sync
**Current**: Secrets manually synced to GitHub and Wrangler
**Proposal**: ChittyConnect secret distribution service
**Impact**: Single source of truth, automatic propagation
**Implementation**:
```bash
# ChittyConnect command
chittyconnect secrets sync \
  --source="1password://ChittyOS-Deployment" \
  --targets="github:chittyos/cli,wrangler:api-gateway"
```

### Gap 3: Missing Database Credential Rotation
**Current**: Database URL shared across all services, no rotation
**Proposal**: Per-service database credentials with automated rotation
**Impact**: Blast radius reduction, zero-downtime rotation
**Implementation**: Use Cloudflare D1 with Wrangler bindings + service-specific access tokens

### Gap 4: No Secret Expiration Monitoring
**Current**: Manual tracking of secret expiration dates
**Proposal**: ChittyConnect secret expiration dashboard + alerts
**Impact**: Proactive rotation before expiration
**Implementation**: Store expiration metadata in ContextConsciousness, alert 14 days before expiry

## Troubleshooting

### Issue: GitHub Actions Cannot Access Secrets
```bash
# Verify secret exists in repository
gh secret list --repo="chittyos/cli" | grep CHITTY_ID_TOKEN

# If missing, reprovision from 1Password
gh secret set CHITTY_ID_TOKEN \
  --repo="chittyos/cli" \
  --body="$(op item get 'CHITTY_ID_TOKEN' --vault='ChittyOS-Deployment' --fields password)"
```

### Issue: Wrangler Secret Not Found in Worker
```bash
# List current secrets
wrangler secret list

# If missing, set from 1Password
op item get 'CHITTY_SERVICE_TOKEN' --vault='ChittyOS-Core' --fields password | \
  wrangler secret put CHITTY_SERVICE_TOKEN

# Redeploy worker
wrangler deploy
```

### Issue: Service Token Authentication Failing
```bash
# Verify token is registered in ChittyAuth
curl -X POST "https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/service/validate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(op item get 'CHITTY_API_GATEWAY_SERVICE_TOKEN' --vault='ChittyOS-Core' --fields password)" \
  -d '{
    "service_token": "'$(op item get 'CHITTY_API_GATEWAY_SERVICE_TOKEN' --vault='ChittyOS-Core' --fields password)'"
  }'

# Expected: {"valid": true, "service_id": "chittyos.api-gateway", "scopes": [...]}
```

## References

- **1Password CLI Documentation**: https://developer.1password.com/docs/cli/
- **GitHub CLI Secrets**: https://cli.github.com/manual/gh_secret
- **Wrangler Secrets**: https://developers.cloudflare.com/workers/wrangler/commands/#secret
- **ChittyConnect Architecture**: `/Users/nb/chittyos/dev/cli/docs/CLAUDE.md`
- **Zero-Trust Principles**: https://www.cloudflare.com/learning/security/glossary/what-is-zero-trust/

## Support

For issues with ChittyConnect × 1Password integration, contact:
- **Infrastructure Team**: infrastructure@chitty.cc
- **Security Team**: security@chitty.cc
- **ChittyConnect Concierge**: This AI assistant (me!)
