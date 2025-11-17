# ChittyConnect × 1Password Integration - Complete Setup

## Quick Links

- **Quick Start Guide**: [QUICKSTART_CHITTYCONNECT_SETUP.md](./QUICKSTART_CHITTYCONNECT_SETUP.md) - 15-minute setup walkthrough
- **Detailed Documentation**: [CHITTYCONNECT_1PASSWORD_SETUP.md](./CHITTYCONNECT_1PASSWORD_SETUP.md) - Comprehensive reference
- **Architecture Map**: [CHITTYCONNECT_ARCHITECTURE_MAP.md](./CHITTYCONNECT_ARCHITECTURE_MAP.md) - Visual topology and flows

## What is ChittyConnect?

ChittyConnect is the secure credential management and service orchestration layer for ChittyOS. It integrates with 1Password to provide:

- Zero-trust secret management for all ChittyOS services
- Automated credential provisioning to GitHub Actions and Cloudflare Workers
- Service-to-service authentication with scope-based authorization
- Credential rotation on 90-day/180-day schedules
- Audit logging and compliance monitoring

## One-Minute Setup

```bash
# 1. Generate and store all credentials in 1Password
./scripts/chittyconnect-setup-1password.sh

# 2. Provision secrets to GitHub repository
./scripts/chittyconnect-sync-github-secrets.sh

# 3. Provision secrets to Cloudflare Workers
./scripts/chittyconnect-sync-wrangler-secrets.sh

# 4. Deploy API Gateway with new secrets
cd chittyos-api-gateway && wrangler deploy

# 5. Validate everything works
cd .. && ./scripts/chittyconnect-validate-connections.sh
```

## Credentials Managed

### Service-to-Service (ChittyOS-Core Vault)
- `CHITTY_API_GATEWAY_SERVICE_TOKEN` - API Gateway → ChittyAuth authentication
- `CHITTY_ID_SERVICE_TOKEN` - API Gateway → ChittyID certificate operations

### GitHub Actions (ChittyOS-Deployment Vault)
- `CHITTY_ID_TOKEN` - Certificate issuance from ChittyID
- `CHITTY_API_KEY` - Chronicle event logging and Registry access
- `CHITTY_REGISTRY_TOKEN` - Package registration
- `CLOUDFLARE_API_TOKEN` - R2 uploads and Workers deployment
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account identifier
- `NPM_TOKEN` - NPM registry publishing

### Third-Party Proxies (ChittyConnect Only Vault)
- `CHITTY_NOTION_TOKEN` - Notion API integration
- `CHITTY_STRIPE_SECRET_KEY` - Stripe payment processing
- `CHITTY_DOCUSIGN_ACCESS_TOKEN` - DocuSign e-signatures
- `CHITTY_BLOCKCHAIN_RPC_URL` - Blockchain RPC endpoint
- `CHITTY_CONTRACT_ADDRESS` - Smart contract address

## Authentication Flows

### GitHub Actions → ChittyID Server
```
Authorization: Bearer {CHITTY_ID_TOKEN}
X-API-Key: {CHITTY_API_KEY}
→ ChittyID validates API key
→ Issues certificate with ChittyID
→ Returns cert_id, pem, private_key
```

### GitHub Actions → API Gateway
```
Authorization: Bearer {CHITTY_API_KEY}
→ API Gateway middleware extracts token
→ Calls ChittyAuth for validation
→ ChittyAuth returns scopes + ChittyID
→ API Gateway checks scope permissions
→ Routes to Chronicle/Registry handler
```

### API Gateway → ChittyAuth (Service-to-Service)
```
Authorization: Bearer {CHITTY_SERVICE_TOKEN}
→ ChittyAuth hashes token (SHA-256)
→ Looks up in service_tokens table
→ Verifies active, not expired
→ Returns service_id + scopes
```

## Credential Rotation

Service tokens expire every 90 days. API keys expire every 180 days.

```bash
# Check what needs rotation
./scripts/chittyconnect-rotate-credentials.sh

# Follow the prompts to rotate
# Then re-sync to targets:
./scripts/chittyconnect-sync-wrangler-secrets.sh
./scripts/chittyconnect-sync-github-secrets.sh

# Redeploy with new credentials
cd chittyos-api-gateway && wrangler deploy

# Validate
./scripts/chittyconnect-validate-connections.sh
```

## Security Architecture

### Zero-Trust Principles
1. **Verify explicitly** - All requests authenticated via ChittyAuth
2. **Least privileged access** - Scope-based permissions per token
3. **Assume breach** - Service tokens hashed, never stored plaintext
4. **Audit everything** - Chronicle event sourcing for all operations

### Secret Management
- Secrets stored encrypted in 1Password (AES-256)
- Never written to disk (piped directly from `op` CLI)
- GitHub/Cloudflare access via environment variables only
- Automatic expiration and rotation schedules

### Service Registration
Service tokens must be registered in ChittyAuth database:
```sql
INSERT INTO service_tokens (service_id, token_hash, scopes, expires_at)
VALUES ('chittyos.api-gateway', SHA256('svc_...'), '["auth:validate"]', NOW() + INTERVAL '90 days');
```

## NPM Publishing Workflow

The `npm-publish-certified.yml` workflow orchestrates certificate-based publishing:

1. **Request certificate** from ChittyID (using `CHITTY_ID_TOKEN`)
2. **Build tarball** and calculate SHA256 hash
3. **Record event** in Chronicle (using `CHITTY_API_KEY`)
4. **Upload to R2** (using `CLOUDFLARE_API_TOKEN`)
5. **Update package.json** with ChittyOS metadata (certificate, provenance, governance)
6. **Register in ChittyOS Registry** (using `CHITTY_REGISTRY_TOKEN`)
7. **Publish to NPM** (using `NPM_TOKEN`)

Each step is authenticated and auditable through ChittyConnect.

## Troubleshooting

### Secrets not found in 1Password
```bash
# List all items in vault
op item list --vault="ChittyOS-Core"
op item list --vault="ChittyOS-Deployment"

# Verify specific secret
op item get "CHITTY_SERVICE_TOKEN" --vault="ChittyOS-Core"
```

### GitHub secrets not syncing
```bash
# Re-authenticate to GitHub
gh auth login

# Manually set a secret
gh secret set CHITTY_ID_TOKEN --repo="chittyos/cli" --body="your-token-here"
```

### Wrangler secrets not accessible
```bash
# Authenticate to Cloudflare
wrangler login

# List current secrets
cd chittyos-api-gateway && wrangler secret list

# Manually set a secret
echo "your-token" | wrangler secret put CHITTY_SERVICE_TOKEN
```

### Service authentication failing
```bash
# Test ChittyAuth connectivity
curl -X POST "https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/service/validate" \
  -H "Authorization: Bearer $(op item get 'CHITTY_API_GATEWAY_SERVICE_TOKEN' --vault='ChittyOS-Core' --fields password)" \
  -H "Content-Type: application/json"

# Expected: {"valid": true, "service_id": "chittyos.api-gateway"}
```

## Enhancement Roadmap

Based on gap analysis, these improvements are prioritized:

### P1 (High Priority)
- **Automated token rotation** - ChittyConnect scheduled worker (every 90 days)
- **Database credential rotation** - Per-service DB users with auto-rotation
- **Blast radius containment** - Row-level security in shared database

### P2 (Medium Priority)
- **Centralized secret sync** - Single command to update all targets
- **Expiration monitoring** - Alert 14 days before credential expiry
- **Multi-region redundancy** - Secret replication across regions

### P3 (Low Priority)
- **Service registration automation** - CLI to register tokens in ChittyAuth
- **Secret usage analytics** - Track which secrets are actively used
- **Emergency access workflows** - Break-glass procedures for incidents

## Architecture Components

```
1Password (Vault)
    ↓
ChittyConnect (Secret Distribution)
    ↓
├── GitHub Secrets (CI/CD)
└── Wrangler Secrets (Workers)
    ↓
ChittyOS Services
    ↓
├── ChittyAuth (Token Validation)
├── ChittyID (Certificates)
├── API Gateway (Router)
└── Registry (Packages)
```

## Support

- **Scripts**: `/Users/nb/chittyos/dev/cli/scripts/chittyconnect-*.sh`
- **Documentation**: `/Users/nb/chittyos/dev/cli/docs/CHITTYCONNECT_*.md`
- **Workflow**: `/Users/nb/chittyos/dev/cli/.github/workflows/npm-publish-certified.yml`

For issues or questions, consult the ChittyConnect Concierge (this AI assistant).

---

**Generated by ChittyConnect Concierge**
Last Updated: 2025-11-15
