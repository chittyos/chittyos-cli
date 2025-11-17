# ChittyOS API Gateway

**Zero-Trust API Gateway for ChittyOS Ecosystem**

Version: 1.0.0
Status: Production Ready
Authentication: ChittyAuth
Credential Management: ChittyConnect × 1Password

---

## Overview

The ChittyOS API Gateway is a Cloudflare Worker that provides centralized routing, authentication, and authorization for the ChittyOS ecosystem. It implements **zero-trust security principles** with authentication via ChittyAuth and secure credential management through ChittyConnect × 1Password.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ChittyOS API Gateway                    │
│                  https://api.chitty.cc                      │
└──────────────────┬──────────────────────────────────────────┘
                   │
         ┌─────────┴─────────┐
         │  Authentication   │
         │   ChittyAuth      │
         │  Zero-Trust Layer │
         └─────────┬─────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
    ▼              ▼              ▼
┌─────────┐  ┌─────────┐  ┌──────────┐
│Chronicle│  │Registry │  │ Quality  │
│ Service │  │ Service │  │ Service  │
└─────────┘  └─────────┘  └──────────┘
```

## Services

### 1. Chronicle Service (`/chronicle`)
Event sourcing and audit trail management.

**Endpoints:**
- `GET /chronicle/events` - List events (public)
- `POST /chronicle/events` - Create event (auth required)
- `GET /chronicle/events/{id}` - Get event details (public)
- `GET /chronicle/packages/{package}/events` - Package event history (public)

### 2. Registry Service (`/registry`)
Package and service registration management.

**Endpoints:**
- `GET /registry/packages` - List packages (public)
- `GET /registry/packages/{package}` - Package versions (public)
- `GET /registry/packages/{package}/{version}` - Package details (public)
- `POST /registry/api/packages/register` - Register package (auth required)
- `PUT /registry/packages/{package}/{version}/status` - Update status (auth required)

### 3. Quality Service (`/quality`)
Quality metrics and compliance tracking.

**Endpoints:**
- `GET /quality/*` - Read quality data (public)
- `POST /quality/*` - Submit quality reports (auth required)

## Security Features

### Zero-Trust Authentication

All write operations (`POST`, `PUT`, `DELETE`, `PATCH`) require authentication via ChittyAuth.

**Supported Authentication Methods:**
- **Bearer Tokens (JWT)** - User authentication
- **Service Tokens** - Service-to-service authentication
- **API Keys** - Long-lived credentials for automation

### Scope-Based Authorization

Fine-grained access control using scopes:

| Service | Required Scope | Operations |
|---------|----------------|------------|
| Chronicle | `chronicle:write` | Create events |
| Registry | `registry:write` | Register packages |
| Registry | `registry:admin` | Update package status |
| Quality | `quality:write` | Submit quality reports |

### CORS Whitelist

No wildcard CORS. Strict origin whitelist:
- `https://chitty.cc`
- `https://www.chitty.cc`
- `https://api.chitty.cc`
- `https://id.chitty.cc`
- `https://registry.chitty.cc`
- `https://mcp.chitty.cc`
- `http://localhost:*` (development only)

### ChittyConnect × 1Password

All credentials managed through 1Password vault:
- Service tokens
- API keys
- Third-party credentials (Notion, Stripe, DocuSign)
- Blockchain RPC URLs

**Credential Rotation:**
- Service tokens: 90 days
- API keys: 180 days
- Manual rotation via 1Password + Wrangler

## Quick Start

### 1. Generate Authentication Token

```bash
curl -X POST https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/jwt/generate \
  -H "Content-Type: application/json" \
  -H "X-ChittyID: YOUR_CHITTY_ID" \
  -d '{
    "expires_in": "1h",
    "claims": {
      "scopes": ["chronicle:write", "registry:write"]
    }
  }'
```

### 2. Create Event (Authenticated)

```bash
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "package.published",
    "package": "@chittyos/example",
    "version": "1.0.0"
  }'
```

### 3. Register Package (Authenticated)

```bash
curl -X POST https://api.chitty.cc/registry/api/packages/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "package_name": "@chittyos/example",
    "version": "1.0.0",
    "cert_id": "cert_abc123",
    "status": "certified"
  }'
```

### 4. Get Event History (Public)

```bash
curl https://api.chitty.cc/chronicle/events?limit=10
```

## Documentation

### Core Documentation
- **[AUTHENTICATION.md](./AUTHENTICATION.md)** - Complete authentication guide
- **[EXAMPLES.md](./EXAMPLES.md)** - curl and code examples
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment procedures

### Code Documentation
- **[src/middleware/auth.ts](./src/middleware/auth.ts)** - Authentication middleware
- **[src/services/chittyconnect.ts](./src/services/chittyconnect.ts)** - Credential management
- **[src/router.ts](./src/router.ts)** - Main routing logic

## Development

### Prerequisites
- Node.js 18+
- Wrangler CLI
- 1Password CLI (for credential management)
- ChittyAuth service running

### Local Development

```bash
# Install dependencies
npm install

# Run locally
wrangler dev --port 8787

# Test endpoints
curl http://localhost:8787/health
```

### Project Structure

```
chittyos-api-gateway/
├── src/
│   ├── router.ts                    # Main worker entry point
│   ├── middleware/
│   │   └── auth.ts                  # ChittyAuth integration
│   ├── services/
│   │   ├── chronicle.ts             # Chronicle service handler
│   │   ├── registry.ts              # Registry service handler
│   │   ├── quality.ts               # Quality service handler
│   │   └── chittyconnect.ts         # Credential management
│   └── openapi-specs/               # OpenAPI specifications
├── wrangler.toml                    # Cloudflare Worker config
├── AUTHENTICATION.md                # Auth documentation
├── EXAMPLES.md                      # Example requests
├── DEPLOYMENT.md                    # Deployment guide
└── README.md                        # This file
```

## Deployment

### Production Deployment

```bash
# 1. Set secrets
wrangler secret put CHITTY_SERVICE_TOKEN
wrangler secret put CHITTY_NOTION_TOKEN
wrangler secret put CHITTY_STRIPE_SECRET_KEY

# 2. Deploy
wrangler deploy

# 3. Verify
curl https://api.chitty.cc/health
```

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for complete deployment procedures.

## Environment Variables

### Public Variables (in wrangler.toml)
- `CHITTY_ID_SERVICE` - ChittyID service URL
- `CHITTYAUTH_URL` - ChittyAuth service URL
- `ENVIRONMENT` - Deployment environment (production/staging/development)

### Secrets (via Wrangler)
- `CHITTY_SERVICE_TOKEN` - Service token for ChittyAuth
- `CHITTY_NOTION_TOKEN` - Notion API token (optional)
- `CHITTY_STRIPE_SECRET_KEY` - Stripe secret key (optional)
- `CHITTY_DOCUSIGN_ACCESS_TOKEN` - DocuSign token (optional)
- `CHITTY_BLOCKCHAIN_RPC_URL` - Blockchain RPC URL (optional)

All secrets stored in 1Password vault: `ChittyOS-Secrets`

## Monitoring

### Health Checks

```bash
# API Gateway health
curl https://api.chitty.cc/health

# Service status
curl https://api.chitty.cc/status
```

### Logs

```bash
# Stream logs
wrangler tail

# Filter errors
wrangler tail | grep -i error
```

### Chronicle Audit Trail

All authenticated actions logged:

```bash
# View authentication events
curl https://api.chitty.cc/chronicle/events?type=auth

# View deployment events
curl https://api.chitty.cc/chronicle/events?type=deployment
```

## Security

### Threat Model

**Protected Against:**
- Unauthorized access to write operations
- API key/token theft (via short-lived JWTs)
- CORS attacks (strict whitelist)
- Audit trail tampering (authenticated actor tracking)

**Defense in Depth:**
1. ChittyAuth token validation
2. Scope-based authorization
3. CORS whitelist
4. Chronicle audit logging
5. 1Password credential management
6. Cloudflare WAF (optional)

### Reporting Security Issues

Email: security@chitty.cc

## API Compliance

### ChittyOS Compliance
- All IDs minted from ChittyID service
- Service-to-service authentication via service tokens
- Chronicle audit logging for all write operations
- 1Password credential management
- Zero-trust architecture

### Standards
- OpenAPI 3.0 specifications
- OAuth 2.0 Bearer tokens
- JWT (RFC 7519)
- CORS (W3C spec)

## Performance

### Cloudflare Edge Network
- Global deployment via Cloudflare Workers
- Sub-100ms latency worldwide
- Automatic DDoS protection
- Unlimited scalability

### Caching Strategy
- KV namespace for credential caching (1 hour TTL)
- Chronicle events cached (24 hours)
- Registry packages cached (1 hour)

## Troubleshooting

### Common Issues

**401 Unauthorized**
- Check token is valid and not expired
- Verify token format: `Bearer <token>`
- Ensure ChittyAuth service is accessible

**403 Forbidden**
- Verify token has required scopes
- Check scope naming: `service:action` pattern
- Regenerate token with correct scopes

**CORS Error**
- Verify origin is in whitelist
- Check preflight OPTIONS request succeeds
- Ensure credentials flag is set

See **[AUTHENTICATION.md](./AUTHENTICATION.md)** for detailed troubleshooting.

## Contributing

1. Follow ChittyOS coding standards
2. All write operations must require authentication
3. Add tests for new endpoints
4. Update OpenAPI specs
5. Document authentication requirements

## License

Proprietary - ChittyCorp LLC

## Support

- Documentation: https://docs.chitty.cc
- Issues: https://github.com/chittyos/api-gateway/issues
- Email: support@chitty.cc

---

**Built with ChittyOS**
Secured by ChittyAuth
Powered by Cloudflare Workers

**Generated:** 2025-11-15
**Version:** 1.0.0
