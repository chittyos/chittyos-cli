# ChittyOS API Gateway - Authentication & Authorization

## Overview

The ChittyOS API Gateway implements **zero-trust authentication** through integration with **ChittyAuth** and secure credential management via **ChittyConnect × 1Password**.

All write operations (`POST`, `PUT`, `DELETE`, `PATCH`) require authentication. Public read operations are allowed for transparency and package discovery.

## Architecture

```
┌─────────────────┐
│  Client Request │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  API Gateway Authentication Layer   │
│  - Extract Bearer Token             │
│  - Validate with ChittyAuth         │
│  - Extract ChittyID & Scopes        │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Authorization Middleware           │
│  - Check Required Scopes            │
│  - Verify Permissions               │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Service Handler                    │
│  - Chronicle, Registry, Quality     │
│  - Receives Authenticated Context   │
└─────────────────────────────────────┘
```

## Authentication Methods

### 1. Bearer Token (JWT)

**Recommended for user-facing applications**

```bash
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "package.published",
    "package": "@chittyos/example",
    "version": "1.0.0"
  }'
```

**How to obtain:**
```bash
# Authenticate with ChittyAuth
curl -X POST https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/jwt/generate \
  -H "Content-Type: application/json" \
  -H "X-ChittyID: chitty_usr_abc123" \
  -d '{
    "expires_in": "1h",
    "claims": {
      "scopes": ["chronicle:write", "registry:write"]
    }
  }'
```

### 2. Service Token

**Recommended for service-to-service communication**

```bash
curl -X POST https://api.chitty.cc/registry/api/packages/register \
  -H "Authorization: Bearer svc_abc123xyz789" \
  -H "Content-Type: application/json" \
  -d '{
    "package_name": "@chittyos/example",
    "version": "1.0.0",
    "cert_id": "cert_123"
  }'
```

**Service token pattern:**
- Prefix: `svc_`
- Stored in 1Password: `op://ChittyOS-Secrets/CHITTY_{SERVICE}_SERVICE_TOKEN/password`
- Set via Wrangler: `wrangler secret put CHITTY_SERVICE_TOKEN`

### 3. API Key

**Recommended for automated scripts and CI/CD**

```bash
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: ApiKey chitty_key_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "package.build.complete",
    "package": "@chittyos/example",
    "version": "1.0.0"
  }'
```

**How to generate:**
```bash
# Generate API key via ChittyAuth
curl -X POST https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/api/keys \
  -H "Content-Type: application/json" \
  -H "X-ChittyID: chitty_usr_abc123" \
  -d '{
    "name": "CI/CD Pipeline",
    "scopes": ["chronicle:write", "registry:read"]
  }'
```

## Scope-Based Authorization

### Chronicle Service Scopes

| Scope | Description | Operations |
|-------|-------------|------------|
| `chronicle:read` | Read event history | GET /chronicle/events |
| `chronicle:write` | Create events | POST /chronicle/events |
| `chronicle:admin` | Full chronicle access | All operations |

### Registry Service Scopes

| Scope | Description | Operations |
|-------|-------------|------------|
| `registry:read` | Read package metadata | GET /registry/packages/* |
| `registry:write` | Register packages | POST /registry/api/packages/register |
| `registry:admin` | Full registry access | All operations including status updates |

### Quality Service Scopes

| Scope | Description | Operations |
|-------|-------------|------------|
| `quality:read` | Read quality metrics | GET /quality/* |
| `quality:write` | Submit quality reports | POST /quality/* |
| `quality:admin` | Full quality access | All operations |

## Public Endpoints (No Auth Required)

These endpoints are publicly accessible for transparency:

- `GET /health` - Health check
- `GET /status` - Service status
- `GET /*/openapi.json` - OpenAPI specifications
- `GET /chronicle/events` - Event history (read-only transparency)
- `GET /chronicle/events/{id}` - Individual event details
- `GET /registry/packages` - Package listing
- `GET /registry/packages/{package}` - Package versions
- `GET /registry/packages/{package}/{version}` - Package details

## Protected Endpoints (Auth Required)

All write operations require authentication:

- `POST /chronicle/events` - Create event
  - Required scope: `chronicle:write`

- `POST /registry/api/packages/register` - Register package
  - Required scope: `registry:write`

- `PUT /registry/packages/{package}/{version}/status` - Update status
  - Required scope: `registry:admin` or `registry:write`

## Response Headers

Authenticated requests include these headers in responses:

```
X-ChittyOS-Authenticated: true
X-ChittyOS-Actor: chitty_usr_abc123
Access-Control-Allow-Origin: https://chitty.cc
```

## Error Responses

### 401 Unauthorized

```json
{
  "error": "Unauthorized",
  "message": "Authentication required",
  "hint": "Provide a valid Bearer token, API key, or service token"
}
```

**Headers:**
```
WWW-Authenticate: Bearer realm="ChittyOS API Gateway"
```

### 403 Forbidden

```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions. Required scope: registry:write",
  "required_scopes": ["registry:write"],
  "user_scopes": ["chronicle:write", "registry:read"]
}
```

## CORS Configuration

The API Gateway uses a **whitelist approach** for CORS:

**Allowed Origins:**
- `https://chitty.cc`
- `https://www.chitty.cc`
- `https://api.chitty.cc`
- `https://id.chitty.cc`
- `https://registry.chitty.cc`
- `https://mcp.chitty.cc`
- `http://localhost:3000` (development)
- `http://localhost:5173` (Vite dev server)
- `http://localhost:8080` (local testing)

**CORS Headers:**
```
Access-Control-Allow-Origin: <matched-origin>
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-ChittyID, X-Request-ID
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

## ChittyConnect Credential Management

All credentials are managed via **ChittyConnect × 1Password** integration.

### Credential Naming Convention

```
CHITTY_{SERVICE}_{CREDENTIAL_TYPE}
```

Examples:
- `CHITTY_API_GATEWAY_SERVICE_TOKEN`
- `CHITTY_NOTION_TOKEN`
- `CHITTY_STRIPE_SECRET_KEY`
- `CHITTY_DOCUSIGN_ACCESS_TOKEN`

### 1Password Vault Structure

**Vault:** `ChittyOS-Secrets`

**Pattern:** `op://ChittyOS-Secrets/CHITTY_{SERVICE}_{CREDENTIAL}/password`

### Setting Secrets

```bash
# Set service token for API Gateway
wrangler secret put CHITTY_SERVICE_TOKEN

# Set third-party credentials
wrangler secret put CHITTY_NOTION_TOKEN
wrangler secret put CHITTY_STRIPE_SECRET_KEY
wrangler secret put CHITTY_DOCUSIGN_ACCESS_TOKEN
```

### Credential Rotation

**Rotation Schedule:**
- Service tokens: 90 days
- API keys: 180 days
- Passwords: 90 days
- Connection strings: As needed

**Rotation Process:**
1. Generate new credential in 1Password
2. Update Wrangler secret: `wrangler secret put CHITTY_{SERVICE}_{CREDENTIAL}`
3. Deploy with new secret: `wrangler deploy`
4. Verify service connectivity
5. Archive old credential in 1Password

## Testing Authentication

### Test with curl

```bash
# Test public endpoint (no auth)
curl https://api.chitty.cc/health

# Test authenticated endpoint (should fail without token)
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Content-Type: application/json" \
  -d '{"event_type": "test"}'

# Expected: 401 Unauthorized

# Test with valid token
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "package.published",
    "package": "@chittyos/test",
    "version": "1.0.0"
  }'
```

### Test with JavaScript

```javascript
// Using fetch API
const response = await fetch('https://api.chitty.cc/chronicle/events', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    event_type: 'package.published',
    package: '@chittyos/example',
    version: '1.0.0',
  }),
});

if (!response.ok) {
  const error = await response.json();
  console.error('Authentication failed:', error);
}

const result = await response.json();
console.log('Event created:', result);
```

## Security Best Practices

### 1. Token Storage

- Never commit tokens to git
- Use environment variables or secret management
- Rotate tokens regularly
- Use short-lived JWTs for user sessions

### 2. Scope Principle of Least Privilege

- Request only necessary scopes
- Service tokens should have minimal scopes
- Separate tokens for different environments

### 3. HTTPS Only

- All API calls must use HTTPS
- HTTP will be rejected

### 4. Rate Limiting

- Implement client-side rate limiting
- Respect 429 responses
- Use exponential backoff for retries

### 5. Audit Logging

All authenticated actions are logged in Chronicle with:
- Authenticated ChittyID
- Granted scopes
- Timestamp
- Request metadata

## Troubleshooting

### "Unauthorized" Error

**Check:**
1. Token is included in `Authorization` header
2. Token format: `Bearer <token>` or `ApiKey <key>`
3. Token has not expired
4. ChittyAuth service is accessible

### "Forbidden" Error

**Check:**
1. Token has required scopes
2. Scope matches endpoint requirements
3. ChittyAuth permissions are correctly configured

### CORS Error

**Check:**
1. Origin is in whitelist
2. Preflight OPTIONS request succeeds
3. Credentials flag is set correctly

### Service Token Invalid

**Check:**
1. Token stored in Wrangler secrets
2. Token format starts with `svc_`
3. Token is active in ChittyAuth
4. Token has not been rotated

## Examples

### Complete Authentication Flow

```bash
# Step 1: Generate JWT for user
USER_TOKEN=$(curl -s -X POST \
  https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/jwt/generate \
  -H "Content-Type: application/json" \
  -H "X-ChittyID: chitty_usr_abc123" \
  -d '{
    "expires_in": "1h",
    "claims": {
      "scopes": ["chronicle:write", "registry:write"]
    }
  }' | jq -r '.token')

# Step 2: Create event with authenticated token
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "package.published",
    "package": "@chittyos/example",
    "version": "1.0.0",
    "metadata": {
      "publisher": "ChittyOS CI/CD"
    }
  }'

# Step 3: Register package with authenticated token
curl -X POST https://api.chitty.cc/registry/api/packages/register \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "package_name": "@chittyos/example",
    "version": "1.0.0",
    "cert_id": "cert_abc123",
    "status": "certified"
  }'
```

## Integration with ChittyID

All authenticated requests include the **ChittyID** of the actor:

```typescript
// In service handlers, extract authenticated identity
const authenticatedChittyId = request.headers.get("X-Authenticated-ChittyID");

// Use for audit trail
const event = {
  id: eventId,
  type: "package.published",
  actor: authenticatedChittyId, // chitty_usr_abc123
  timestamp: new Date().toISOString(),
};
```

## Support

For authentication issues:
- Check ChittyAuth service status: `https://chittyauth-mcp-121.chittycorp-llc.workers.dev/health`
- Review Chronicle audit logs for failed auth attempts
- Verify 1Password credential configuration
- Contact ChittyOS support with request ID

---

**Generated with ChittyOS API Gateway v1.0.0**
**Last Updated:** 2025-11-15
