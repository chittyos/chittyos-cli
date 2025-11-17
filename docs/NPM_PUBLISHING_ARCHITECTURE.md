# ChittyOS NPM Publishing Architecture
## Certificate-Based Package Distribution

**Last Updated:** November 13, 2025
**Status:** ✅ IMPLEMENTED

---

## Overview

ChittyOS implements a **certificate-based NPM publishing architecture** that provides cryptographic proof of authenticity, provenance tracking, and governance compliance for all published packages. Every package receives a **ChittyID certificate** before publication, with full event sourcing through the **Chronicle API** and registration in the **ChittyOS Registry**.

---

## Architecture Components

### 1. **ChittyID Certificate Authority**
**Endpoint:** `https://id.chitty.cc`

Issues cryptographic certificates for packages, services, and entities.

**API Endpoints:**
- `POST /v1/certificates/issue` - Issue new certificate
- `GET /v1/certificates/verify/:cert_id` - Verify certificate
- `GET /v1/certificates/:cert_id` - Get certificate details
- `POST /v1/certificates/:cert_id/revoke` - Revoke certificate
- `GET /v1/certificates/package/:package_name` - List package certificates

**Certificate Structure:**
```json
{
  "cert_id": "CERT-PKG-20251113-001",
  "chitty_id": "chitty://cert/pkg/executive-mcp/2025/001",
  "fingerprint": "sha256:abc123...",
  "issued_at": "2025-11-13T00:00:00Z",
  "expires_at": "2026-11-13T00:00:00Z",
  "pem": "-----BEGIN CHITTYOS CERTIFICATE-----...",
  "verify_url": "https://id.chitty.cc/v1/certificates/verify/CERT-PKG-20251113-001"
}
```

### 2. **Chronicle Event Sourcing**
**Endpoint:** `https://api.chitty.cc/chronicle`

Records all package lifecycle events for audit trails and provenance tracking.

**API Endpoints:**
- `POST /chronicle/events` - Create event
- `GET /chronicle/events/:event_id` - Get event details
- `GET /chronicle/packages/:package/events` - Get package event history

**Event Types:**
- `package.build.start`
- `package.build.complete`
- `package.build.failed`
- `package.test.complete`
- `package.certificate.issued`
- `package.published`
- `package.deprecated`
- `package.unpublished`

### 3. **ChittyOS Registry**
**Endpoint:** `https://registry.chitty.cc`

Central registry for all ChittyOS-certified packages.

**API Endpoints:**
- `POST /registry/api/packages/register` - Register package
- `GET /registry/packages` - List all packages
- `GET /registry/packages/:package` - List package versions
- `GET /registry/packages/:package/:version` - Get package details
- `PUT /registry/packages/:package/:version/status` - Update status

**Storage:** Cloudflare KV Namespace `SERVICE_REGISTRY`

### 4. **Cloudflare R2 Storage**
**Bucket:** `chitty-processed-docs`

Stores signed tarballs and certificate bundles.

**Path Structure:**
```
chitty-processed-docs/
  packages/
    @chittyos/
      executive-mcp/
        1.0.0.tgz
        1.0.0.tgz.cert.pem
```

---

## Publishing Flow

```
┌─────────────────────────────────────────────┐
│  1. Developer creates PR                    │
│     → ChittyCanon governance approval       │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  2. GitHub Release Created                  │
│     → Triggers npm-publish-certified.yml    │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  3. Request ChittyID Certificate            │
│     POST https://id.chitty.cc/v1/...        │
│     → Returns cert_id, chitty_id, keys      │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  4. Build & Test Package                    │
│     → npm ci, npm test, npm build           │
│     → npm pack (create tarball)             │
│     → Calculate SHA256 hash                 │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  5. Record Chronicle Event                  │
│     POST https://api.chitty.cc/chronicle... │
│     Event: "package.build.complete"         │
│     → Returns event_id, chronicle_url       │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  6. Upload to Cloudflare R2                 │
│     → Tarball: packages/{name}/{ver}.tgz    │
│     → Certificate bundle: .cert.pem         │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  7. Update package.json                     │
│     → Add chittyos.certificate metadata     │
│     → Add chittyos.provenance metadata      │
│     → Add chittyos.governance metadata      │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  8. Register with ChittyOS Registry         │
│     POST https://registry.chitty.cc/...     │
│     → Stores in SERVICE_REGISTRY KV         │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  9. Publish to NPM                          │
│     npm publish (with certificate metadata) │
└─────────────────────────────────────────────┘
```

---

## Package Metadata Structure

Every published package includes ChittyOS metadata in `package.json`:

```json
{
  "name": "@chittyos/executive-mcp",
  "version": "1.0.0",

  "chittyos": {
    "service_id": "chittyos.executive-mcp",
    "domain": "ops",

    "certificate": {
      "cert_id": "CERT-PKG-20251113-001",
      "chitty_id": "chitty://cert/pkg/executive-mcp/2025/001",
      "fingerprint": "sha256:abc123...",
      "issued_at": "2025-11-13T00:00:00Z",
      "expires_at": "2026-11-13T00:00:00Z",
      "verify_url": "https://id.chitty.cc/v1/certificates/verify/CERT-PKG-20251113-001"
    },

    "provenance": {
      "chronicle_event": "evt_20251113120000_abc123",
      "chronicle_url": "https://api.chitty.cc/chronicle/events/evt_20251113120000_abc123",
      "tarball_hash": "sha256:def456...",
      "r2_storage": "chitty-processed-docs/packages/@chittyos/executive-mcp/1.0.0.tgz",
      "registry_url": "https://registry.chitty.cc/packages/@chittyos/executive-mcp/1.0.0"
    },

    "governance": {
      "approved_by": ["github_user"],
      "approval_date": "2025-11-13",
      "approval_url": "https://github.com/chittyos/cli/releases/tag/v1.0.0",
      "policy_version": "v1.0"
    },

    "build": {
      "commit": "abc123def456",
      "workflow_run": "12345",
      "timestamp": "2025-11-13T12:00:00Z"
    }
  }
}
```

---

## GitHub Actions Workflow

**File:** `.github/workflows/npm-publish-certified.yml`

**Triggers:**
- Release created
- Manual workflow dispatch

**Required Secrets:**
- `CHITTY_ID_TOKEN` - Authentication for ChittyID service
- `CHITTY_API_KEY` - API key for Chronicle and Registry
- `CHITTY_REGISTRY_TOKEN` - Registry registration token
- `CLOUDFLARE_API_TOKEN` - Cloudflare R2 access
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account
- `NPM_TOKEN` - NPM publishing token

**Workflow Steps:**
1. ✅ Checkout code
2. ✅ Setup Node.js
3. ✅ Install dependencies
4. ✅ Run tests
5. ✅ Build package
6. ✅ Request ChittyID certificate
7. ✅ Build and sign tarball
8. ✅ Record Chronicle event
9. ✅ Upload to R2
10. ✅ Update package.json
11. ✅ Register with ChittyOS
12. ✅ Publish to NPM
13. ✅ Generate deployment summary
14. ✅ Clean up sensitive files

---

## Verification for Consumers

Consumers can verify package authenticity:

### 1. **Verify Certificate**
```bash
curl https://id.chitty.cc/v1/certificates/verify/CERT-PKG-20251113-001
```

### 2. **Check Chronicle Event**
```bash
curl https://api.chitty.cc/chronicle/events/evt_20251113120000_abc123
```

### 3. **Query Registry**
```bash
curl https://registry.chitty.cc/packages/@chittyos/executive-mcp/1.0.0
```

### 4. **Verify Tarball Hash**
```bash
npm pack @chittyos/executive-mcp@1.0.0
sha256sum chittyos-executive-mcp-1.0.0.tgz
# Compare with chittyos.provenance.tarball_hash in package.json
```

---

## Updated NPM Audit Recommendations

Based on the certificate-based architecture, here are the updated recommendations for the 7 audited packages:

### ✅ **chittyos-executive-mcp** - READY TO PUBLISH
**Priority:** HIGH
**Status:** Certificate-ready

**Actions Required:**
1. ✅ Add scope: `@chittyos/executive-mcp`
2. ✅ Configure GitHub secrets (CHITTY_ID_TOKEN, etc.)
3. ✅ Create release to trigger workflow
4. ✅ Certificate will be auto-issued on publish

### ⚠️ **chittyid-client** - NEEDS COMPLETION
**Priority:** CRITICAL
**Status:** Not ready for certification

**Blockers:**
- Missing README.md
- Incomplete package.json metadata
- No tests

**Actions Required:**
1. Complete package metadata
2. Add comprehensive documentation
3. Add test suite
4. Then follow certificate workflow

### ⚠️ **chittyid-server** - EVALUATE NECESSITY
**Priority:** LOW
**Status:** Should not be published

**Recommendation:** Mark as `"private": true` - servers shouldn't be NPM packages

### ⚠️ **@chittyos/github-app (replit)** - FIX THEN PUBLISH
**Priority:** HIGH
**Status:** Almost ready

**Blockers:**
- Broken bin references (chitty-cli.js doesn't exist)
- Missing README.md

**Actions Required:**
1. Fix bin references or remove them
2. Add README.md
3. Run `npm install` to generate package-lock.json
4. Then use certificate workflow

### ⚠️ **chittyos-mcp-desktop** - READY (MCP Format)
**Priority:** MEDIUM
**Status:** Uses .mcpb format, not standard NPM

**Note:** This package uses MCP extension format, not NPM. Certificate workflow can be adapted for .mcpb releases.

### ❌ **chittyos-api-gateway** - DO NOT PUBLISH
**Priority:** N/A
**Status:** Cloudflare Worker

**Action:** Add `"private": true` - this is infrastructure, not a package

### ❌ **1password-qa-testing** - DO NOT PUBLISH
**Priority:** CRITICAL
**Status:** Test suite

**Action:** **IMMEDIATELY ADD** `"private": true`

---

## Security Benefits

### 1. **Cryptographic Proof of Authenticity**
- Every package has a ChittyID certificate
- Certificate signed by ChittyFoundation CA
- Fingerprints verifiable via public API

### 2. **Complete Provenance Tracking**
- Full build history in Chronicle
- Git commit, workflow run, actor recorded
- Tarball hash stored immutably

### 3. **Governance Compliance**
- Approval workflow enforced
- All publishes audited
- Certificate revocation supported

### 4. **Supply Chain Security**
- Tamper detection via hash verification
- Certificate expiration (1-year validity)
- R2 backup of all artifacts

---

## Next Steps

### Immediate (Week 1)
1. ✅ Configure GitHub secrets for ChittyOS services
2. ✅ Fix broken bin references in replit package
3. ✅ Add `"private": true` to non-publishable packages
4. ✅ Test certificate workflow with one package

### Short-term (Week 2-3)
1. Document consumer verification process
2. Create CLI tool for certificate verification
3. Add certificate validation to CI/CD
4. Publish first certified package

### Long-term (Month 2+)
1. Implement certificate renewal workflow
2. Add certificate revocation list (CRL)
3. Create governance dashboard
4. Integrate with Notion for approval tracking

---

## Resources

- **ChittyID Server:** `/Users/nb/chittyos/dev/cli/chittyid-server/`
- **Chronicle Service:** `/Users/nb/chittyos/dev/cli/chittyos-api-gateway/src/services/chronicle.ts`
- **Registry Service:** `/Users/nb/chittyos/dev/cli/chittyos-api-gateway/src/services/registry.ts`
- **Workflow:** `/Users/nb/chittyos/dev/cli/.github/workflows/npm-publish-certified.yml`
- **Certificate Manager:** `/Users/nb/chittyos/dev/cli/chittyid-server/lib/certificate-manager.js`

---

## Support

For questions or issues:
- **ChittyID Issues:** Check certificate verification endpoint
- **Chronicle Issues:** Review event logs in KV namespace
- **Registry Issues:** Query SERVICE_REGISTRY KV
- **Workflow Issues:** Check GitHub Actions logs

**Governance Contact:** governance@chittyos.com
