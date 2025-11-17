# ChittyConnect Architecture Map
## Certificate-Based NPM Publishing Infrastructure

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                        1PASSWORD SECRET MANAGEMENT                      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────────┐
│  ChittyOS-Core      │  │ ChittyOS-Deployment │  │ ChittyConnect Only   │
├─────────────────────┤  ├─────────────────────┤  ├──────────────────────┤
│ Service Tokens:     │  │ CI/CD Credentials:  │  │ Third-party APIs:    │
│                     │  │                     │  │                      │
│ • API_GATEWAY_      │  │ • CHITTY_ID_TOKEN   │  │ • NOTION_TOKEN       │
│   SERVICE_TOKEN     │  │ • CHITTY_API_KEY    │  │ • STRIPE_SECRET_KEY  │
│                     │  │ • REGISTRY_TOKEN    │  │ • DOCUSIGN_TOKEN     │
│ • ID_SERVICE_TOKEN  │  │ • CLOUDFLARE_TOKEN  │  │ • BLOCKCHAIN_RPC     │
│                     │  │ • NPM_TOKEN         │  │ • OPENAI_API_KEY     │
└──────────┬──────────┘  └──────────┬──────────┘  └───────────┬──────────┘
           │                        │                          │
           └────────────┬───────────┴──────────────────────────┘
                        │
                        ▼
           ┌────────────────────────┐
           │  ChittyConnect Secret  │
           │  Distribution Engine   │
           └────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
         │                             │
         ▼                             ▼
┌──────────────────┐         ┌──────────────────────┐
│ GitHub Secrets   │         │ Cloudflare Workers   │
│ (chittyos/cli)   │         │ (Wrangler Secrets)   │
└──────────────────┘         └──────────────────────┘


┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                     DEPLOYED SERVICES TOPOLOGY                          ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

                          ┌──────────────────────┐
                          │   ChittyAuth MCP     │
                          │  (Authentication)    │
                          │ chittyauth-mcp-121.  │
                          │ chittycorp-llc.      │
                          │ workers.dev          │
                          └──────────┬───────────┘
                                     │
                                     │ Service Token
                                     │ Validation
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
        ▼                            ▼                            ▼
┌───────────────┐          ┌─────────────────┐         ┌──────────────────┐
│  ChittyID     │          │  API Gateway    │         │  ChittyRegistry  │
│  Server       │◄─────────│  (Router)       │────────►│  (Packages)      │
│               │          │                 │         │                  │
│ id.chitty.cc  │  Service │ api.chitty.cc   │ Service │ registry.chitty  │
│               │  Token   │                 │ Token   │ .cc              │
│               │          │ ┌─────────────┐ │         │                  │
│ Endpoints:    │          │ │ Chronicle   │ │         │                  │
│ • /v1/certs/  │          │ │ (Events)    │ │         │                  │
│   issue       │          │ ├─────────────┤ │         │                  │
│ • /v1/certs/  │          │ │ Quality     │ │         │                  │
│   verify      │          │ │ (Metrics)   │ │         │                  │
│ • /v1/service/│          │ ├─────────────┤ │         │                  │
│   validate    │          │ │ Registry    │ │         │                  │
└───────┬───────┘          │ │ (Proxy)     │ │         │                  │
        │                  │ └─────────────┘ │         │                  │
        │                  └─────────────────┘         └──────────────────┘
        │                           │
        │                           │
        │                           ▼
        │                  ┌─────────────────┐
        │                  │  KV Namespace   │
        │                  │  (Registry DB)  │
        │                  └─────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│                       SHARED POSTGRESQL DATABASE                       │
├───────────────────────────────────────────────────────────────────────┤
│  Tables:                                                               │
│  • service_tokens (token_hash, service_id, scopes, expires_at)        │
│  • api_keys (key_hash, chitty_id, scopes, status)                     │
│  • certificates (cert_id, chitty_id, pem, fingerprint, issued_at)     │
│  • audit_logs (timestamp, actor, action, resource, outcome)           │
└───────────────────────────────────────────────────────────────────────┘


┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                  NPM PUBLISHING WORKFLOW (GitHub Actions)               ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    ┌─────────────────────────────────────────────────────────────────┐
    │  GitHub Release Created  OR  Workflow Dispatch Triggered        │
    └─────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
    ┌────────────────────────────────────────────────────────────────┐
    │  Step 1: Checkout, Install, Test, Build                        │
    └─────────────────────────┬──────────────────────────────────────┘
                              │
                              ▼
    ┌────────────────────────────────────────────────────────────────┐
    │  Step 2: Request ChittyID Certificate                          │
    │  ┌──────────────────────────────────────────────────────────┐  │
    │  │ POST /v1/certificates/issue                              │  │
    │  │ Authorization: Bearer {CHITTY_ID_TOKEN}                  │  │
    │  │ X-API-Key: {CHITTY_API_KEY}                              │  │
    │  │                                                          │  │
    │  │ Response:                                                │  │
    │  │ • cert_id                                                │  │
    │  │ • chitty_id                                              │  │
    │  │ • pem, private_key, public_key                           │  │
    │  │ • fingerprint                                            │  │
    │  └──────────────────────────────────────────────────────────┘  │
    └─────────────────────────┬──────────────────────────────────────┘
                              │
                              ▼
    ┌────────────────────────────────────────────────────────────────┐
    │  Step 3: Build & Sign Tarball                                  │
    │  • npm pack                                                     │
    │  • Calculate SHA256 hash                                        │
    │  • Sign with private key                                        │
    └─────────────────────────┬──────────────────────────────────────┘
                              │
                              ▼
    ┌────────────────────────────────────────────────────────────────┐
    │  Step 4: Record Chronicle Event                                │
    │  ┌──────────────────────────────────────────────────────────┐  │
    │  │ POST /chronicle/events                                   │  │
    │  │ Authorization: Bearer {CHITTY_API_KEY}                   │  │
    │  │                                                          │  │
    │  │ Event: package.build.complete                            │  │
    │  │ • cert_id                                                │  │
    │  │ • tarball_hash (SHA256)                                  │  │
    │  │ • build_timestamp                                        │  │
    │  │ • commit, workflow_run, actor                            │  │
    │  │                                                          │  │
    │  │ Response: event_id, chronicle_url                        │  │
    │  └──────────────────────────────────────────────────────────┘  │
    └─────────────────────────┬──────────────────────────────────────┘
                              │
                              ▼
    ┌────────────────────────────────────────────────────────────────┐
    │  Step 5: Upload to Cloudflare R2                               │
    │  • wrangler r2 object put (tarball)                             │
    │  • wrangler r2 object put (certificate)                         │
    │  • Location: packages/{name}/{version}.tgz                      │
    └─────────────────────────┬──────────────────────────────────────┘
                              │
                              ▼
    ┌────────────────────────────────────────────────────────────────┐
    │  Step 6: Update package.json with ChittyOS Metadata            │
    │  {                                                              │
    │    "chittyos": {                                                │
    │      "certificate": { cert_id, chitty_id, fingerprint },        │
    │      "provenance": { chronicle_event, tarball_hash, r2_url },   │
    │      "governance": { approved_by, approval_date },              │
    │      "build": { commit, workflow_run, timestamp }               │
    │    }                                                            │
    │  }                                                              │
    └─────────────────────────┬──────────────────────────────────────┘
                              │
                              ▼
    ┌────────────────────────────────────────────────────────────────┐
    │  Step 7: Register with ChittyOS Registry                       │
    │  ┌──────────────────────────────────────────────────────────┐  │
    │  │ POST /registry/api/packages/register                     │  │
    │  │ Authorization: Bearer {CHITTY_REGISTRY_TOKEN}            │  │
    │  │                                                          │  │
    │  │ • package_name, version                                  │  │
    │  │ • cert_id, chronicle_event_id                            │  │
    │  │ • r2_location                                            │  │
    │  │ • status: "certified"                                    │  │
    │  └──────────────────────────────────────────────────────────┘  │
    └─────────────────────────┬──────────────────────────────────────┘
                              │
                              ▼
    ┌────────────────────────────────────────────────────────────────┐
    │  Step 8: Publish to NPM                                         │
    │  • npm publish                                                  │
    │  • NODE_AUTH_TOKEN: {NPM_TOKEN}                                 │
    └─────────────────────────┬──────────────────────────────────────┘
                              │
                              ▼
    ┌────────────────────────────────────────────────────────────────┐
    │  Step 9: Create Deployment Summary                             │
    │  • Certificate details                                          │
    │  • Chronicle event link                                         │
    │  • Registry URLs (ChittyOS + NPM)                               │
    │  • R2 storage location                                          │
    └────────────────────────────────────────────────────────────────┘


┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    ZERO-TRUST AUTHENTICATION FLOWS                      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Flow 1: GitHub Actions → ChittyID (Certificate Request)
──────────────────────────────────────────────────────

┌─────────────────┐
│ GitHub Actions  │
└────────┬────────┘
         │ POST /v1/certificates/issue
         │ Authorization: Bearer {CHITTY_ID_TOKEN}
         │ X-API-Key: {CHITTY_API_KEY}
         │ X-Request-ID: {uuid}
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ ChittyID Server Authentication                              │
│ 1. Extract API key from Authorization header                │
│ 2. Hash key with SHA-256                                    │
│ 3. Query: SELECT * FROM api_keys                            │
│           WHERE key_hash = $hash                            │
│           AND status = 'active'                             │
│           AND expires_at > NOW()                            │
│ 4. Verify scope includes 'certificate:request'              │
│ 5. Check rate limit (requests per minute)                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ ✓ Authenticated
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Certificate Issuance                                        │
│ 1. Generate key pair (2048-bit RSA)                         │
│ 2. Create ChittyID: chittyos.{service}.{uuid}               │
│ 3. Issue X.509 certificate (1-year validity)                │
│ 4. Store in database with fingerprint                       │
│ 5. Record audit log                                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
         ┌──────────────────────┐
         │ Certificate Response │
         │ • cert_id            │
         │ • chitty_id          │
         │ • pem                │
         │ • private_key        │
         │ • public_key         │
         │ • fingerprint        │
         └──────────────────────┘


Flow 2: GitHub Actions → API Gateway (Chronicle/Registry)
──────────────────────────────────────────────────────────

┌─────────────────┐
│ GitHub Actions  │
└────────┬────────┘
         │ POST /chronicle/events
         │ Authorization: Bearer {CHITTY_API_KEY}
         │ Content-Type: application/json
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ API Gateway Middleware (auth.ts)                            │
│ 1. Extract token from Authorization header                  │
│ 2. Detect token type based on format:                       │
│    • Contains '.' → JWT (bearer)                            │
│    • Starts with 'svc_' → Service token                     │
│    • Otherwise → API key                                    │
│ 3. Call authenticateRequest()                               │
└─────────────────────┬───────────────────────────────────────┘
                      │ Token type: apikey
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ ChittyAuth Validation (validateApiKey)                      │
│ 1. POST to ChittyAuth: /v1/api/keys/validate                │
│    Authorization: Bearer {CHITTY_API_KEY}                   │
│    Body: { "api_key": "{CHITTY_API_KEY}" }                  │
│                                                             │
│ 2. ChittyAuth processes:                                    │
│    • Hash key (SHA-256)                                     │
│    • Lookup in database                                     │
│    • Verify active + not expired                           │
│    • Return { valid: true, chitty_id, scopes }              │
└─────────────────────┬───────────────────────────────────────┘
                      │ ✓ Authenticated
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Authorization Check (Chronicle Handler)                     │
│ 1. Verify 'chronicle:write' in scopes                       │
│ 2. If missing → 403 Forbidden                               │
│ 3. If present → Proceed to handler                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Chronicle Event Recording                                   │
│ 1. Generate event_id (UUID)                                 │
│ 2. Store in KV: chronicle:events:{event_id}                 │
│ 3. Add authenticated ChittyID to metadata                   │
│ 4. Return event_id and chronicle_url                        │
└─────────────────────────────────────────────────────────────┘


Flow 3: API Gateway → ChittyAuth (Service-to-Service)
──────────────────────────────────────────────────────

┌─────────────────────┐
│ API Gateway Worker  │
│ (Incoming Request)  │
└──────────┬──────────┘
           │ User request requires auth
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│ requireAuth() Middleware                                     │
│ 1. Extract user's Bearer token from request                 │
│ 2. Need to validate with ChittyAuth                         │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│ Service-to-Service Call to ChittyAuth                       │
│ POST https://chittyauth-mcp-121.chittycorp-llc.workers.dev  │
│      /v1/jwt/validate                                        │
│                                                             │
│ Headers:                                                    │
│   Authorization: Bearer {CHITTY_SERVICE_TOKEN} ◄─┐          │
│   Content-Type: application/json                 │          │
│                                                  │          │
│ This is the API Gateway's service token          │          │
│ proving its identity to ChittyAuth               │          │
│                                                  │          │
│ Retrieved from Wrangler secret:                  │          │
│ env.CHITTY_SERVICE_TOKEN                         │          │
└──────────┬────────────────────────────────┬────────────────┘
           │                                │
           ▼                                │
┌─────────────────────────────────────────┐ │
│ ChittyAuth Token Validation              │ │
│ 1. Verify API Gateway's service token    │ │
│ 2. Then validate user's JWT              │ │
│ 3. Return user's ChittyID + scopes       │ │
└─────────────────────┬───────────────────┘ │
                      │                     │
                      ▼                     │
           ┌─────────────────┐              │
           │ AuthContext     │              │
           │ • authenticated │              │
           │ • chitty_id     │              │
           │ • scopes[]      │              │
           │ • tokenType     │              │
           └─────────────────┘              │
                                            │
This demonstrates the dual-layer           │
authentication:                             │
1. Service authenticates to ChittyAuth ─────┘
2. User authenticates through service


┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                       CREDENTIAL ROTATION WORKFLOW                      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Every 90 Days (Service Tokens) / 180 Days (API Keys)
─────────────────────────────────────────────────────

    ┌───────────────────────────────────────────────────────────┐
    │  Step 1: Rotation Detection                               │
    │  ./scripts/chittyconnect-rotate-credentials.sh            │
    │                                                           │
    │  Checks 1Password item metadata for created_at date      │
    │  Calculates age in days                                   │
    │  Identifies tokens requiring rotation                     │
    └─────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
    ┌───────────────────────────────────────────────────────────┐
    │  Step 2: Generate New Tokens                              │
    │  • Generate new cryptographically secure token            │
    │  • Prefix: svc_ (service) or chitty_ (API key)            │
    │  • Length: 64 hex characters (256-bit entropy)            │
    └─────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
    ┌───────────────────────────────────────────────────────────┐
    │  Step 3: Archive Old Token in 1Password                   │
    │  • Retrieve current token value                           │
    │  • Add rotation log to notes field:                       │
    │    "Rotated on 2025-11-15T07:30:00Z"                      │
    │    "Previous token: svc_abc123... (first 16 chars)"       │
    │  • Update item with new token                             │
    └─────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
    ┌───────────────────────────────────────────────────────────┐
    │  Step 4: Sync to Deployment Targets                       │
    │  ./scripts/chittyconnect-sync-wrangler-secrets.sh         │
    │  ./scripts/chittyconnect-sync-github-secrets.sh           │
    │                                                           │
    │  • Wrangler: echo $NEW_TOKEN | wrangler secret put        │
    │  • GitHub: echo $NEW_TOKEN | gh secret set                │
    └─────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
    ┌───────────────────────────────────────────────────────────┐
    │  Step 5: Re-register in Authentication Services           │
    │  • Hash new token (SHA-256)                               │
    │  • Update ChittyAuth service_tokens table                 │
    │  • Update ChittyID service authorizations                 │
    │  • Maintain same scopes and permissions                   │
    └─────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
    ┌───────────────────────────────────────────────────────────┐
    │  Step 6: Redeploy Workers                                 │
    │  cd chittyos-api-gateway && wrangler deploy               │
    │                                                           │
    │  • Workers pick up new secrets from environment           │
    │  • Zero-downtime rotation (old token still valid briefly) │
    └─────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
    ┌───────────────────────────────────────────────────────────┐
    │  Step 7: Validate New Connections                         │
    │  ./scripts/chittyconnect-validate-connections.sh          │
    │                                                           │
    │  • Test service-to-service authentication                 │
    │  • Verify API key validation                              │
    │  • Confirm all endpoints accessible                       │
    └─────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
    ┌───────────────────────────────────────────────────────────┐
    │  Step 8: Revoke Old Token (Grace Period Complete)        │
    │  • Mark old token as 'revoked' in database                │
    │  • Update status in 1Password rotation log                │
    │  • Old token no longer valid for authentication           │
    └───────────────────────────────────────────────────────────┘


┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                       SECURITY CONTROLS MATRIX                          ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Layer          | Control                    | Implementation
───────────────┼────────────────────────────┼──────────────────────────────
Secret Storage | Zero-knowledge vault       | 1Password (AES-256 encrypted)
               | Secrets never on disk      | Piped directly to target
               | Access audit logging       | 1Password activity logs
───────────────┼────────────────────────────┼──────────────────────────────
Transport      | TLS 1.3 only               | Cloudflare Workers default
               | HTTPS required             | All endpoints enforce HTTPS
               | Certificate pinning        | ChittyID certificate validation
───────────────┼────────────────────────────┼──────────────────────────────
Authentication | Token-based auth           | Bearer tokens (JWT, API keys)
               | Service token hashing      | SHA-256 before database lookup
               | Token expiration           | 90-day max for service tokens
               | Rate limiting              | 100 req/min per service
───────────────┼────────────────────────────┼──────────────────────────────
Authorization  | Scope-based permissions    | {service}:{action} pattern
               | Least privilege            | Minimal scopes per token
               | Resource-level ACLs        | Permission checks per resource
───────────────┼────────────────────────────┼──────────────────────────────
Audit          | Request logging            | X-Request-ID tracking
               | Actor attribution          | ChittyID in all events
               | Immutable event log        | Chronicle event sourcing
               | Retention: 90 days         | KV namespace TTL
───────────────┼────────────────────────────┼──────────────────────────────
Network        | Origin whitelisting        | CORS allowedOrigins list
               | Internal service mesh      | Workers-to-Workers auth
               | Public read, private write | Zero-trust enforcement
───────────────┼────────────────────────────┼──────────────────────────────
Data           | Encryption at rest         | Cloudflare KV encryption
               | Encrypted backups          | R2 server-side encryption
               | PII handling               | Minimal collection, ChittyID ref
───────────────┼────────────────────────────┼──────────────────────────────
Incident Resp. | Automated rotation         | Script-driven token refresh
               | Emergency revocation       | Database status update
               | Breach notification        | Audit log alerts


┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    ENHANCEMENT OPPORTUNITIES (GAPS)                     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Gap                          Current State                  Proposed Solution
────────────────────────────┼──────────────────────────────┼─────────────────
Automated Token Rotation     Manual script execution        ChittyConnect cron
                            every 90 days                   worker scheduled job

Impact: High                 Risk: Human error in          Automation: Check
Priority: P1                 rotation timing                expiry daily, rotate
                                                           automatically
────────────────────────────┼──────────────────────────────┼─────────────────
Centralized Secret Sync      Separate scripts for GitHub   Unified sync command
                            and Wrangler
                                                           chittyconnect secrets
Impact: Medium               Tedious multi-step process     sync --all-targets
Priority: P2
────────────────────────────┼──────────────────────────────┼─────────────────
Secret Expiration Monitoring No proactive alerts           ContextConsciousness
                                                           monitoring dashboard
Impact: Medium               Reactive rotation only
Priority: P2                                               Alert 14 days before
                                                           expiry via email/Slack
────────────────────────────┼──────────────────────────────┼─────────────────
Database Credential Rotation Shared connection string,     Per-service DB creds
                            no rotation                    with auto-rotation
Impact: High                 Single point of failure
Priority: P1                 if compromised                 Use Cloudflare D1
                                                           service bindings
────────────────────────────┼──────────────────────────────┼─────────────────
Service Registration         Manual curl commands          ChittyConnect CLI
Automation
                                                           chittyconnect service
Impact: Low                  Error-prone, undocumented      register api-gateway
Priority: P3                                                --auto-register
────────────────────────────┼──────────────────────────────┼─────────────────
Credential Blast Radius      All services share same DB    Service-specific
Containment                  connection                     database users

Impact: High                 Compromise affects all         Row-level security
Priority: P1                 services                       policies in DB
────────────────────────────┼──────────────────────────────┼─────────────────
Multi-Region Redundancy      Single region deployment      Multi-region secrets
                                                           replication
Impact: Medium               Outage if region fails
Priority: P2                                               1Password Emergency
                                                           Kit + failover secrets


┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                         AUTOMATION SCRIPT MAP                           ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Script                                    Purpose                    Run Frequency
──────────────────────────────────────────┼──────────────────────────┼──────────────
chittyconnect-setup-1password.sh          Initial credential setup   Once (first time)
                                          Generate all tokens
                                          Store in 1Password

chittyconnect-sync-github-secrets.sh      Provision GitHub secrets   After token gen
                                          from 1Password             or rotation

chittyconnect-sync-wrangler-secrets.sh    Provision Wrangler secrets After token gen
                                          from 1Password             or rotation

chittyconnect-validate-connections.sh     Test authentication flows  After deployment
                                          Verify zero-trust setup    or changes

chittyconnect-rotate-credentials.sh       Rotate expired tokens      Every 90 days
                                          Archive old tokens         (manual/cron)
                                          Sync to targets

Execution Order (First-Time Setup):
────────────────────────────────────
1. chittyconnect-setup-1password.sh
2. chittyconnect-sync-github-secrets.sh
3. chittyconnect-sync-wrangler-secrets.sh
4. wrangler deploy (from API Gateway directory)
5. Register services in ChittyAuth (manual curl)
6. chittyconnect-validate-connections.sh


┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                              FILE LOCATIONS                             ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Documentation:
/Users/nb/chittyos/dev/cli/docs/CHITTYCONNECT_1PASSWORD_SETUP.md
/Users/nb/chittyos/dev/cli/docs/QUICKSTART_CHITTYCONNECT_SETUP.md
/Users/nb/chittyos/dev/cli/docs/CHITTYCONNECT_ARCHITECTURE_MAP.md (this file)

Automation Scripts:
/Users/nb/chittyos/dev/cli/scripts/chittyconnect-setup-1password.sh
/Users/nb/chittyos/dev/cli/scripts/chittyconnect-sync-github-secrets.sh
/Users/nb/chittyos/dev/cli/scripts/chittyconnect-sync-wrangler-secrets.sh
/Users/nb/chittyos/dev/cli/scripts/chittyconnect-validate-connections.sh
/Users/nb/chittyos/dev/cli/scripts/chittyconnect-rotate-credentials.sh

Workflow Configuration:
/Users/nb/chittyos/dev/cli/.github/workflows/npm-publish-certified.yml

Service Implementation:
/Users/nb/chittyos/dev/cli/chittyos-api-gateway/src/router.ts
/Users/nb/chittyos/dev/cli/chittyos-api-gateway/src/middleware/auth.ts
/Users/nb/chittyos/dev/cli/chittyos-api-gateway/wrangler.toml

ChittyID Server:
/Users/nb/chittyos/dev/cli/chittyid-server/server.js (needs certificate endpoints)


End of Architecture Map
