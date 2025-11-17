# ChittyOS Certificate Publishing - Quick Reference Card

---

## 🚀 Quick Start

```bash
# 1. Start services locally
cd chittyid-server && npm start &
cd chittyos-api-gateway && npx wrangler dev &

# 2. Run tests
node tests/certificate-publishing-e2e.test.js

# 3. Validate setup
bash scripts/validate-certificate-publishing.sh
```

---

## 🔗 Real Endpoints

| Service | URL |
|---------|-----|
| ChittyID | `https://id.chitty.cc` |
| Chronicle | `https://api.chitty.cc/chronicle` |
| Registry | `https://registry.chitty.cc` |

---

## 📡 API Quick Reference

### ChittyID Certificates
```bash
# Issue certificate
POST https://id.chitty.cc/v1/certificates/issue
Headers: X-API-Key: YOUR_KEY
Body: {"type":"package","package_name":"...","version":"..."}

# Verify certificate (public)
GET https://id.chitty.cc/v1/certificates/verify/CERT-ID
```

### Chronicle Events
```bash
# Record event
POST https://api.chitty.cc/chronicle/events
Headers: Authorization: Bearer TOKEN
Body: {"event_type":"package.build.complete","package":"...","version":"..."}

# Get package history
GET https://api.chitty.cc/chronicle/packages/PACKAGE-NAME/events
```

### Registry
```bash
# Register package
POST https://registry.chitty.cc/registry/api/packages/register
Headers: Authorization: Bearer TOKEN
Body: {"package_name":"...","version":"...","cert_id":"..."}

# List packages
GET https://registry.chitty.cc/registry/packages
```

---

## 🔑 Required Secrets

```
CHITTY_ID_TOKEN          - ChittyID auth
CHITTY_API_KEY           - API key
CHITTY_REGISTRY_TOKEN    - Registry auth
CLOUDFLARE_API_TOKEN     - Cloudflare access
CLOUDFLARE_ACCOUNT_ID    - Account ID
NPM_TOKEN                - NPM publish
```

---

## 📦 Package Metadata

```json
{
  "chittyos": {
    "certificate": {
      "cert_id": "CERT-PKG-...",
      "verify_url": "https://id.chitty.cc/v1/certificates/verify/..."
    },
    "provenance": {
      "chronicle_url": "https://api.chitty.cc/chronicle/events/...",
      "r2_storage": "chitty-processed-docs/packages/..."
    }
  }
}
```

---

## 🧪 Testing

```bash
# Full test suite
node tests/certificate-publishing-e2e.test.js

# Validation
bash scripts/validate-certificate-publishing.sh

# Individual endpoint test
curl https://id.chitty.cc/health
```

---

## 📚 Documentation

- Architecture: `docs/NPM_PUBLISHING_ARCHITECTURE.md`
- Search Guide: `docs/SEARCH_AND_DISCOVERY.md`
- Testing: `docs/TESTING_AND_VALIDATION.md`
- Summary: `CERTIFICATE_PUBLISHING_SUMMARY.md`

---

## 🔍 Quick Search

```bash
# Find certificate code
grep -r "issuePackageCertificate" chittyid-server/

# Find event types
grep "package\." chittyos-api-gateway/src/services/chronicle.ts

# Find registry endpoints
grep "registry/" chittyos-api-gateway/src/services/registry.ts
```

---

## ✅ Files Created

**Services:**
- `chittyid-server/lib/certificate-manager.js`
- `chittyos-api-gateway/src/services/registry.ts`

**Workflow:**
- `.github/workflows/npm-publish-certified.yml`

**Tests:**
- `tests/certificate-publishing-e2e.test.js`
- `scripts/validate-certificate-publishing.sh`

**Docs:**
- `docs/NPM_PUBLISHING_ARCHITECTURE.md`
- `docs/SEARCH_AND_DISCOVERY.md`
- `docs/TESTING_AND_VALIDATION.md`
- `CERTIFICATE_PUBLISHING_SUMMARY.md`
- `QUICK_REFERENCE.md` (this file)

---

## 🎯 Publishing Checklist

- [ ] Configure GitHub secrets
- [ ] Start services locally
- [ ] Run tests
- [ ] Create release
- [ ] Monitor workflow
- [ ] Verify published package

---

**For detailed information, see the full documentation in `/docs/`**
