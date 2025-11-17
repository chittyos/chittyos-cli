# ChittyConnect × 1Password Quick Start Guide

## Overview

This quick-start guide walks you through configuring secure credentials for ChittyOS certificate-based NPM publishing using ChittyConnect × 1Password integration.

**Estimated time:** 15-20 minutes

## Prerequisites

Ensure you have the following tools installed and configured:

```bash
# 1Password CLI
op --version

# GitHub CLI
gh --version

# Wrangler CLI
wrangler --version

# jq (for JSON processing in validation)
jq --version
```

### Install Missing Tools

```bash
# macOS (Homebrew)
brew install --cask 1password-cli
brew install gh jq
npm install -g wrangler

# Authenticate to 1Password
op signin

# Authenticate to GitHub
gh auth login
```

## Step-by-Step Setup

### Step 1: Generate and Store Secrets in 1Password

Run the automated setup script to generate all required service tokens and API keys:

```bash
cd /Users/nb/chittyos/dev/cli
./scripts/chittyconnect-setup-1password.sh
```

**What this does:**
- Creates/verifies 1Password vault structure
- Generates service tokens for API Gateway → ChittyAuth and ChittyID
- Generates API keys for GitHub Actions → ChittyID, Chronicle, Registry
- Prompts for Cloudflare API token and NPM token (if not already stored)

**Expected output:**
```
✓ All prerequisites installed
✓ 1Password authenticated
✓ 1Password vaults ready
✓ Service tokens generated and stored
✓ GitHub Actions tokens generated and stored
```

**Important credentials to provide:**

1. **CLOUDFLARE_API_TOKEN**: Generate at https://dash.cloudflare.com/profile/api-tokens
   - Required permissions: Workers Scripts Write, Account R2 Write

2. **NPM_TOKEN**: Generate at https://www.npmjs.com/settings/[username]/tokens
   - Token type: Automation or Publish

### Step 2: Provision GitHub Repository Secrets

Sync secrets from 1Password to GitHub repository:

```bash
./scripts/chittyconnect-sync-github-secrets.sh
```

**What this does:**
- Retrieves secrets from 1Password (ChittyOS-Deployment vault)
- Sets them as GitHub repository secrets using `gh` CLI
- Verifies all required secrets are present

**Expected output:**
```
Syncing CHITTY_ID_TOKEN... ✓
Syncing CHITTY_API_KEY... ✓
Syncing CHITTY_REGISTRY_TOKEN... ✓
Syncing CLOUDFLARE_API_TOKEN... ✓
Syncing CLOUDFLARE_ACCOUNT_ID... ✓
Syncing NPM_TOKEN... ✓

✓ All secrets synced successfully!
```

**Verify GitHub secrets:**
```bash
gh secret list --repo="chittyos/cli"
```

### Step 3: Configure Wrangler Secrets for API Gateway

Sync secrets from 1Password to Cloudflare Workers:

```bash
./scripts/chittyconnect-sync-wrangler-secrets.sh
```

**What this does:**
- Retrieves service-to-service tokens from ChittyOS-Core vault
- Retrieves third-party credentials from ChittyConnect vault
- Sets them as Wrangler secrets for the API Gateway worker
- Uses secure piping (secrets never touch disk)

**Expected output:**
```
Syncing CHITTY_SERVICE_TOKEN from ChittyOS-Core... ✓
Syncing CHITTY_ID_SERVICE_TOKEN from ChittyOS-Core... ✓
Syncing CHITTY_NOTION_TOKEN from ChittyConnect... ✓
Syncing CHITTY_STRIPE_SECRET_KEY from ChittyConnect... ✓

✓ All secrets synced successfully!
```

**Note:** If some third-party secrets don't exist yet (Notion, Stripe, etc.), that's OK. They're only needed when you use those integrations.

### Step 4: Deploy API Gateway with New Secrets

Deploy the updated worker to Cloudflare:

```bash
cd /Users/nb/chittyos/dev/cli/chittyos-api-gateway
wrangler deploy
```

**Expected output:**
```
Total Upload: XX KiB / gzip: XX KiB
Uploaded chittyos-api-gateway (X.XX sec)
Published chittyos-api-gateway (X.XX sec)
  https://chittyos-api-gateway.ccorp.workers.dev
Current Deployment ID: XXXXXXXXX
```

### Step 5: Validate Connections

Run comprehensive validation tests:

```bash
cd /Users/nb/chittyos/dev/cli
./scripts/chittyconnect-validate-connections.sh
```

**What this tests:**
- Service health endpoints
- GitHub Actions credential authentication
- Service-to-service token validation
- Public endpoint access (no auth required)
- Zero-trust enforcement (unauthorized requests properly rejected)

**Expected output:**
```
Test 1: API Gateway health endpoint
  ✓ PASSED

Test 2: API Gateway status endpoint
  ✓ PASSED

...

Total tests run: 11
Passed: 11
Failed: 0

✓ All tests passed! ChittyConnect is properly configured.
```

## Service Registration in ChittyAuth

**IMPORTANT:** After generating service tokens, you must register them in ChittyAuth for service-to-service authentication to work.

### Register API Gateway Service Token

```bash
# Get the token hash for registration
CHITTY_SERVICE_TOKEN=$(op item get 'CHITTY_API_GATEWAY_SERVICE_TOKEN' --vault='ChittyOS-Core' --fields password)
TOKEN_HASH=$(echo -n "$CHITTY_SERVICE_TOKEN" | sha256sum | cut -d' ' -f1)

# Register with ChittyAuth
curl -X POST "https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/service/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CHITTY_ADMIN_TOKEN" \
  -d "{
    \"service_id\": \"chittyos.api-gateway\",
    \"service_name\": \"ChittyOS API Gateway\",
    \"service_token_hash\": \"$TOKEN_HASH\",
    \"scopes\": [\"auth:validate\", \"permission:check\", \"service:status\"],
    \"rotation_interval_days\": 90
  }"
```

**Note:** Replace `$CHITTY_ADMIN_TOKEN` with admin token for ChittyAuth service.

### Register ChittyID Service Access

```bash
# Get ChittyID service token hash
CHITTY_ID_SERVICE_TOKEN=$(op item get 'CHITTY_ID_SERVICE_TOKEN' --vault='ChittyOS-Core' --fields password)
TOKEN_HASH=$(echo -n "$CHITTY_ID_SERVICE_TOKEN" | sha256sum | cut -d' ' -f1)

# Register with ChittyID
curl -X POST "https://id.chitty.cc/v1/service/authorize" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CHITTY_ID_ADMIN_KEY" \
  -d "{
    \"service_id\": \"chittyos.api-gateway\",
    \"service_token_hash\": \"$TOKEN_HASH\",
    \"scopes\": [\"certificate:issue\", \"certificate:verify\", \"certificate:list\"],
    \"rate_limit\": {\"requests_per_minute\": 100}
  }"
```

**Note:** This step may be deferred until ChittyID certificate endpoints are deployed.

## Testing NPM Publishing Workflow

Once all credentials are configured, test the full workflow:

### Option 1: Manual Workflow Dispatch

```bash
cd /Users/nb/chittyos/dev/cli

gh workflow run npm-publish-certified.yml \
  --ref main \
  -f package_path="chittyos-executive-mcp"

# Monitor workflow execution
gh run watch
```

### Option 2: Create a Test Release

```bash
# Create and push a tag
git tag executive-mcp-v1.0.0
git push origin executive-mcp-v1.0.0

# Create GitHub release (triggers workflow)
gh release create executive-mcp-v1.0.0 \
  --title "Executive MCP v1.0.0" \
  --notes "Test release for ChittyOS certification"
```

## Credential Rotation

Service tokens should be rotated every 90 days per security policy.

### Check Rotation Status

```bash
./scripts/chittyconnect-rotate-credentials.sh
```

This script will:
- Check all service tokens and API keys for age
- Identify which credentials need rotation
- Offer to automatically rotate expired tokens
- Archive old tokens in 1Password notes

### Post-Rotation Steps

After rotating credentials:

1. **Sync Wrangler secrets:**
   ```bash
   ./scripts/chittyconnect-sync-wrangler-secrets.sh
   ```

2. **Redeploy workers:**
   ```bash
   cd chittyos-api-gateway && wrangler deploy
   ```

3. **Re-register service tokens in ChittyAuth** (see registration section above)

4. **Validate connections:**
   ```bash
   ./scripts/chittyconnect-validate-connections.sh
   ```

## Troubleshooting

### Issue: GitHub secret sync fails

```bash
# Verify GitHub CLI is authenticated
gh auth status

# Re-authenticate if needed
gh auth login

# Verify secret exists in 1Password
op item get 'CHITTY_ID_TOKEN' --vault='ChittyOS-Deployment' --fields password
```

### Issue: Wrangler secret sync fails

```bash
# Authenticate to Cloudflare
wrangler login

# Verify you're in the correct directory
cd /Users/nb/chittyos/dev/cli/chittyos-api-gateway

# Check current secrets
wrangler secret list
```

### Issue: Validation tests fail

```bash
# Check API Gateway deployment status
curl https://chittyos-api-gateway.ccorp.workers.dev/health

# Review worker logs
cd chittyos-api-gateway
wrangler tail

# Verify service registration in ChittyAuth
curl -X POST "https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/service/validate" \
  -H "Authorization: Bearer $(op item get 'CHITTY_API_GATEWAY_SERVICE_TOKEN' --vault='ChittyOS-Core' --fields password)"
```

### Issue: NPM workflow fails

```bash
# Check GitHub Actions workflow logs
gh run list --workflow=npm-publish-certified.yml
gh run view [run-id]

# Verify all secrets are set
gh secret list --repo="chittyos/cli"

# Test individual service connections
./scripts/chittyconnect-validate-connections.sh
```

## Architecture Reference

### Authentication Flow: GitHub Actions → ChittyID

```
GitHub Actions Workflow
    ↓ (CHITTY_ID_TOKEN)
ChittyID Server (/v1/certificates/issue)
    ↓ Validates API key
    ↓ Checks certificate:request scope
    ↓ Issues certificate with ChittyID
Certificate Response (cert_id, pem, keys)
```

### Authentication Flow: API Gateway → ChittyAuth

```
API Gateway Middleware
    ↓ (CHITTY_SERVICE_TOKEN)
ChittyAuth Service (/v1/service/validate)
    ↓ Hash token (SHA-256)
    ↓ Lookup in service_tokens table
    ↓ Verify active + not expired
    ↓ Return scopes + service_id
Authenticated Request Context
```

### Secret Storage Pattern

```
1Password Vault
    ↓ op item get [secret] --fields password
Shell (ephemeral - piped directly)
    ↓ gh secret set / wrangler secret put
GitHub Secrets / Cloudflare Workers
    ↓ Accessed via env variables
Application Runtime
```

## Security Best Practices

1. **Never commit secrets to git** - Always use environment variables or secret management
2. **Never echo secrets to console** - Use silent input and piping
3. **Rotate on schedule** - Service tokens every 90 days, API keys every 180 days
4. **Audit access** - Review 1Password access logs regularly
5. **Minimize scope** - Grant only necessary permissions for each token
6. **Monitor usage** - Check Cloudflare/GitHub logs for suspicious activity

## Next Steps

1. **Deploy ChittyID certificate endpoints** to enable full workflow
2. **Set up automated rotation** using ChittyConnect cron jobs (enhancement opportunity)
3. **Implement secret expiration monitoring** with alerts 14 days before expiry
4. **Create centralized secret sync service** for one-command propagation

## Support

- **Documentation:** `/Users/nb/chittyos/dev/cli/docs/CHITTYCONNECT_1PASSWORD_SETUP.md`
- **Scripts:** `/Users/nb/chittyos/dev/cli/scripts/chittyconnect-*.sh`
- **Workflow:** `/Users/nb/chittyos/dev/cli/.github/workflows/npm-publish-certified.yml`

For assistance, reach out to the ChittyConnect Concierge (this AI assistant)!
