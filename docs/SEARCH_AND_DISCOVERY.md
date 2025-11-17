# ChittyOS Certificate Publishing - Search & Discovery Guide

**Last Updated:** November 13, 2025

---

## Overview

This guide explains how to search, discover, and validate ChittyOS certified packages across all endpoints and documentation.

---

## 🔍 Searching the Process Documentation

### Quick Reference

| What to Find | Where to Look | Search Command |
|--------------|---------------|----------------|
| Certificate endpoints | `docs/NPM_PUBLISHING_ARCHITECTURE.md` | `grep -r "POST /v1/certificates" docs/` |
| Chronicle event types | `chittyos-api-gateway/src/services/chronicle.ts` | `grep "package\." src/services/chronicle.ts` |
| Registry endpoints | `chittyos-api-gateway/src/services/registry.ts` | `grep "app\.(get\|post\|put)" src/` |
| Workflow steps | `.github/workflows/npm-publish-certified.yml` | `grep "name:" .github/workflows/` |
| Package metadata | `docs/NPM_PUBLISHING_ARCHITECTURE.md` | `grep -A 20 "chittyos"` |

### Search Process Documentation

#### 1. **Find Certificate Issuance Process**

```bash
# Search for certificate issuance in all docs
grep -r "certificate.*issue" docs/

# Find certificate endpoints in source code
grep -r "POST.*certificates" chittyid-server/

# View certificate manager implementation
cat chittyid-server/lib/certificate-manager.js | grep -A 5 "issuePackageCertificate"
```

#### 2. **Find Chronicle Event Types**

```bash
# List all package event types
grep "package\." chittyos-api-gateway/src/services/chronicle.ts

# Find event creation logic
grep -A 20 "POST.*events" chittyos-api-gateway/src/services/chronicle.ts

# Search documentation for event examples
grep -r "package.build" docs/
```

#### 3. **Find Registry Operations**

```bash
# Find all registry endpoints
grep "registry/" chittyos-api-gateway/src/services/registry.ts

# Search for package registration
grep -A 10 "register" chittyos-api-gateway/src/services/registry.ts

# Find KV storage operations
grep "KV_NAMESPACE" chittyos-api-gateway/src/services/registry.ts
```

#### 4. **Find Publishing Workflow Steps**

```bash
# List all workflow steps
grep "- name:" .github/workflows/npm-publish-certified.yml

# Find specific step (e.g., certificate request)
grep -A 30 "Request ChittyID Certificate" .github/workflows/npm-publish-certified.yml

# Find environment variables used
grep "env:" .github/workflows/npm-publish-certified.yml
```

---

## 📚 API Endpoint Discovery

### ChittyID Service (`https://id.chitty.cc`)

**Discover Available Endpoints:**
```bash
# Health check
curl https://id.chitty.cc/health

# View server implementation for all routes
grep "app\.(get\|post)" chittyid-server/server.js
```

**Certificate Endpoints:**
- `POST /v1/certificates/issue` - Issue certificate
- `GET /v1/certificates/verify/:cert_id` - Verify certificate
- `GET /v1/certificates/:cert_id` - Get certificate
- `POST /v1/certificates/:cert_id/revoke` - Revoke certificate
- `GET /v1/certificates/package/:package_name` - List package certs

### Chronicle Service (`https://api.chitty.cc/chronicle`)

**Discover Service Info:**
```bash
# Get service information
curl https://api.chitty.cc/chronicle

# Response includes all endpoints and event types
```

**Chronicle Endpoints:**
- `GET /chronicle/openapi.json` - OpenAPI spec
- `GET /chronicle/events` - List events
- `POST /chronicle/events` - Create event
- `GET /chronicle/events/:id` - Get event
- `GET /chronicle/packages/:package/events` - Package history

### Registry Service (`https://registry.chitty.cc`)

**Discover Service Info:**
```bash
# Get service information
curl https://registry.chitty.cc/registry

# Response includes all endpoints
```

**Registry Endpoints:**
- `POST /registry/api/packages/register` - Register package
- `GET /registry/packages` - List all packages
- `GET /registry/packages/:package` - List versions
- `GET /registry/packages/:package/:version` - Get details
- `PUT /registry/packages/:package/:version/status` - Update status

---

## 🔎 Package Discovery

### Find All Certified Packages

```bash
# Query the registry
curl https://registry.chitty.cc/registry/packages | jq '.packages'

# Output:
# [
#   {
#     "package_name": "@chittyos/executive-mcp",
#     "latest_version": "1.0.0",
#     "registered_at": "2025-11-13T12:00:00Z"
#   },
#   ...
# ]
```

### Find Package Versions

```bash
# Get all versions of a package
curl https://registry.chitty.cc/registry/packages/@chittyos/executive-mcp | jq '.versions'

# Output:
# [
#   {
#     "version": "1.0.0",
#     "reg_id": "reg_...",
#     "cert_id": "CERT-PKG-20251113-001",
#     "status": "certified",
#     "registered_at": "2025-11-13T12:00:00Z"
#   }
# ]
```

### Get Package Details

```bash
# Get complete package registration
curl https://registry.chitty.cc/registry/packages/@chittyos/executive-mcp/1.0.0

# Includes certificate ID, Chronicle event, R2 location, etc.
```

---

## 🔐 Certificate Discovery & Verification

### Find Certificate for Package

```bash
# List all certificates for a package
curl -H "X-API-Key: YOUR_KEY" \
  https://id.chitty.cc/v1/certificates/package/@chittyos/executive-mcp

# Output:
# {
#   "package_name": "@chittyos/executive-mcp",
#   "certificates": [
#     {
#       "cert_id": "CERT-PKG-20251113-001",
#       "version": "1.0.0",
#       "status": "active",
#       "issued_at": "2025-11-13T00:00:00Z",
#       "expires_at": "2026-11-13T00:00:00Z"
#     }
#   ],
#   "total": 1
# }
```

### Verify Certificate

```bash
# Public endpoint - no auth required
curl https://id.chitty.cc/v1/certificates/verify/CERT-PKG-20251113-001

# Output:
# {
#   "valid": true,
#   "certificate": {
#     "cert_id": "CERT-PKG-20251113-001",
#     "chitty_id": "chitty://cert/pkg/executive-mcp/2025/001",
#     "subject": {...},
#     "fingerprint": "sha256:...",
#     "issued_at": "2025-11-13T00:00:00Z",
#     "expires_at": "2026-11-13T00:00:00Z",
#     "status": "active"
#   }
# }
```

---

## 📜 Chronicle Event Discovery

### Find Package Build History

```bash
# Get all events for a package
curl https://api.chitty.cc/chronicle/packages/@chittyos/executive-mcp/events

# Output:
# {
#   "package": "@chittyos/executive-mcp",
#   "events": [
#     {
#       "event_id": "evt_20251113120000_abc123",
#       "event_type": "package.build.complete",
#       "version": "1.0.0",
#       "timestamp": "2025-11-13T12:00:00Z"
#     },
#     {
#       "event_id": "evt_20251113120100_def456",
#       "event_type": "package.published",
#       "version": "1.0.0",
#       "timestamp": "2025-11-13T12:01:00Z"
#     }
#   ],
#   "total": 2
# }
```

### Get Event Details

```bash
# Get complete event information
curl https://api.chitty.cc/chronicle/events/evt_20251113120000_abc123

# Output includes:
# - Event type
# - Package name and version
# - Certificate ID
# - Build artifacts (tarball hash, size, etc.)
# - Metadata (commit, workflow, builder, etc.)
```

---

## 🧪 Testing & Validation

### Run Full Test Suite

```bash
# Navigate to CLI directory
cd /Users/nb/chittyos/dev/cli

# Run E2E tests
node tests/certificate-publishing-e2e.test.js

# Run validation script
bash scripts/validate-certificate-publishing.sh
```

### Test Individual Endpoints

```bash
# Test ChittyID health
curl https://id.chitty.cc/health

# Test Chronicle service
curl https://api.chitty.cc/chronicle

# Test Registry service
curl https://registry.chitty.cc/registry
```

---

## 📖 Documentation Structure

### Primary Documentation Files

```
/Users/nb/chittyos/dev/cli/
├── docs/
│   ├── NPM_PUBLISHING_ARCHITECTURE.md    # Main architecture doc
│   ├── SEARCH_AND_DISCOVERY.md          # This file
│   └── MCP_EXTENSION_GUIDE.md           # MCP-specific guide
│
├── chittyid-server/
│   ├── server.js                        # ChittyID endpoints
│   ├── lib/certificate-manager.js       # Certificate logic
│   └── api/openapi-spec.yaml           # API spec
│
├── chittyos-api-gateway/
│   ├── src/services/chronicle.ts        # Chronicle service
│   ├── src/services/registry.ts         # Registry service
│   └── openapi-specs/chronicle.json     # Chronicle API spec
│
├── .github/workflows/
│   └── npm-publish-certified.yml        # Publishing workflow
│
└── tests/
    └── certificate-publishing-e2e.test.js  # E2E tests
```

### Search Documentation by Topic

```bash
# Find architecture overview
grep -A 10 "## Overview" docs/NPM_PUBLISHING_ARCHITECTURE.md

# Find publishing flow
grep -A 50 "## Publishing Flow" docs/NPM_PUBLISHING_ARCHITECTURE.md

# Find package metadata structure
grep -A 40 "## Package Metadata" docs/NPM_PUBLISHING_ARCHITECTURE.md

# Find verification procedures
grep -A 20 "## Verification" docs/NPM_PUBLISHING_ARCHITECTURE.md
```

---

## 🎯 Common Search Patterns

### Find Specific Implementation

```bash
# Find how certificates are issued
grep -r "issuePackageCertificate" chittyid-server/

# Find how events are recorded
grep -r "chronicle/events" chittyos-api-gateway/

# Find how packages are registered
grep -r "packages/register" chittyos-api-gateway/
```

### Find Configuration

```bash
# Find required environment variables
grep -r "process.env" chittyid-server/ chittyos-api-gateway/

# Find GitHub secrets
grep "secrets\." .github/workflows/npm-publish-certified.yml

# Find API endpoints
grep -r "https://.*chitty.cc" docs/ .github/
```

### Find Error Handling

```bash
# Find error codes
grep -r "error_code" chittyid-server/ chittyos-api-gateway/

# Find validation logic
grep -r "assert\|validate" chittyid-server/ chittyos-api-gateway/

# Find error messages
grep -r "error.*message" chittyid-server/ chittyos-api-gateway/
```

---

## 🛠️ Developer Tools

### Quick Commands

```bash
# Start ChittyID server locally
cd chittyid-server && npm start

# Start API Gateway locally (Cloudflare Workers dev)
cd chittyos-api-gateway && npx wrangler dev

# Run tests
npm test

# Validate setup
bash scripts/validate-certificate-publishing.sh
```

### Debugging

```bash
# Check ChittyID logs
tail -f chittyid-server/logs/*.log

# Check workflow runs
gh run list --workflow=npm-publish-certified.yml

# View specific run
gh run view RUN_ID --log
```

---

## 📋 Quick Reference Cheat Sheet

### Service URLs
- **ChittyID:** `https://id.chitty.cc`
- **Chronicle:** `https://api.chitty.cc/chronicle`
- **Registry:** `https://registry.chitty.cc`

### Common Operations

```bash
# Issue certificate (requires auth)
curl -X POST https://id.chitty.cc/v1/certificates/issue \
  -H "X-API-Key: $API_KEY" \
  -d '{"type":"package","package_name":"...","version":"..."}'

# Verify certificate (public)
curl https://id.chitty.cc/v1/certificates/verify/CERT-ID

# Record event (requires auth)
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"event_type":"package.build.complete","package":"...","version":"..."}'

# Register package (requires auth)
curl -X POST https://registry.chitty.cc/registry/api/packages/register \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"package_name":"...","version":"...","cert_id":"..."}'

# List all packages (public)
curl https://registry.chitty.cc/registry/packages
```

---

## 💡 Tips for Effective Searching

1. **Use grep with context:**
   ```bash
   grep -A 10 -B 5 "search_term" file.js  # 10 lines after, 5 before
   ```

2. **Search across file types:**
   ```bash
   grep -r --include="*.ts" --include="*.js" "pattern" .
   ```

3. **Use jq for JSON:**
   ```bash
   curl API_URL | jq '.field.subfield'
   ```

4. **Search git history:**
   ```bash
   git log --all --grep="certificate"
   git log -S "function_name" --source --all
   ```

5. **Find recently modified:**
   ```bash
   find . -name "*.ts" -mtime -7  # Modified in last 7 days
   ```

---

## 🆘 Support

If you can't find what you're looking for:

1. **Check service info endpoints** - they list all available operations
2. **Review OpenAPI specs** - `/chronicle/openapi.json`
3. **Read source code comments** - implementation files are well-documented
4. **Check GitHub workflow** - shows complete publishing flow
5. **Run validation script** - highlights missing components

For additional help: governance@chittyos.com
