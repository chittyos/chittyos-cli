# ChittyOS Certificate Publishing - Testing & Validation Guide

**Last Updated:** November 13, 2025
**Status:** ✅ READY FOR TESTING

---

## Overview

This guide provides comprehensive testing procedures for the ChittyOS certificate-based NPM publishing architecture, including UX validation, endpoint testing, and integration validation.

---

## 🧪 Test Environments

### Local Development
- **ChittyID Server:** `http://localhost:3000`
- **API Gateway (Wrangler Dev):** `http://localhost:8787`
- **Test Database:** In-memory (development)

### Staging
- **ChittyID Server:** `https://staging.id.chitty.cc`
- **API Gateway:** `https://staging-api.chitty.cc`
- **Registry:** `https://staging-api.chitty.cc/registry`

### Production
- **ChittyID Server:** `https://id.chitty.cc`
- **API Gateway:** `https://api.chitty.cc`
- **Registry:** `https://registry.chitty.cc`

---

## 📋 Pre-Test Checklist

### Required Services Running

```bash
# Start ChittyID Server
cd chittyid-server
npm install
npm start

# Start API Gateway (Cloudflare Workers)
cd chittyos-api-gateway
npm install
npx wrangler dev --port 8787
```

### Required Environment Variables

```bash
export CHITTY_ID_SERVICE="http://localhost:3000"
export CHITTY_API_GATEWAY="http://localhost:8787"
export CHITTY_REGISTRY="http://localhost:8787"
export CHITTY_API_KEY="dev-key-123"
export CHITTY_ID_TOKEN="dev-token-456"
```

### Test Data

```bash
# Set test package details
export TEST_PACKAGE="@chittyos/test-package"
export TEST_VERSION="1.0.0-test"
```

---

## 🚀 Quick Start Testing

### Run All Tests

```bash
# Navigate to CLI directory
cd /Users/nb/chittyos/dev/cli

# Run validation script
bash scripts/validate-certificate-publishing.sh

# Run E2E tests
node tests/certificate-publishing-e2e.test.js
```

### Expected Output

```
🧪 Starting ChittyOS Certificate Publishing E2E Tests

🧪 ChittyID Server Health Check... ✅ PASS
🧪 API Gateway Health Check... ✅ PASS
🧪 ChittyID - Mint Package Identity... ✅ PASS
🧪 Certificate - Issue Package Certificate... ✅ PASS
🧪 Certificate - Verify Certificate... ✅ PASS
...

════════════════════════════════════════════════════════════
📊 TEST RESULTS
════════════════════════════════════════════════════════════
✅ Passed: 17
❌ Failed: 0
📈 Total:  17
🎯 Success Rate: 100.0%
════════════════════════════════════════════════════════════
```

---

## 🔍 Component Testing

### 1. ChittyID Certificate Service

#### Test Certificate Issuance

```bash
# Request certificate
curl -X POST http://localhost:3000/v1/certificates/issue \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-key-123" \
  -d '{
    "type": "package",
    "package_name": "@chittyos/test-package",
    "version": "1.0.0",
    "requester": {
      "github_user": "test-user"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "cert_id": "CERT-PKG-20251113-001",
  "chitty_id": "2511-C-DOC-1234-I-56-7-AB",
  "fingerprint": "sha256:abc123...",
  "issued_at": "2025-11-13T12:00:00.000Z",
  "expires_at": "2026-11-13T12:00:00.000Z",
  "pem": "-----BEGIN CHITTYOS CERTIFICATE-----...",
  "public_key": "-----BEGIN PUBLIC KEY-----...",
  "private_key": "-----BEGIN PRIVATE KEY-----...",
  "verify_url": "https://id.chitty.cc/v1/certificates/verify/CERT-PKG-20251113-001"
}
```

#### Test Certificate Verification

```bash
# Verify certificate (public endpoint)
curl http://localhost:3000/v1/certificates/verify/CERT-PKG-20251113-001
```

**Expected Response:**
```json
{
  "valid": true,
  "certificate": {
    "cert_id": "CERT-PKG-20251113-001",
    "chitty_id": "2511-C-DOC-1234-I-56-7-AB",
    "subject": {
      "package_name": "@chittyos/test-package",
      "version": "1.0.0"
    },
    "fingerprint": "sha256:abc123...",
    "issued_at": "2025-11-13T12:00:00.000Z",
    "expires_at": "2026-11-13T12:00:00.000Z",
    "status": "active"
  }
}
```

### 2. Chronicle Event Service

#### Test Event Creation

```bash
# Create package build event
curl -X POST http://localhost:8787/chronicle/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-key-123" \
  -d '{
    "event_type": "package.build.complete",
    "package": "@chittyos/test-package",
    "version": "1.0.0",
    "cert_id": "CERT-PKG-20251113-001",
    "artifacts": {
      "tarball_hash": "sha256:test123",
      "size_bytes": 12345
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "event_id": "evt_20251113120000_abc123",
  "chronicle_url": "https://api.chitty.cc/chronicle/events/evt_20251113120000_abc123",
  "timestamp": "2025-11-13T12:00:00.000Z"
}
```

#### Test Event Retrieval

```bash
# Get event details
curl http://localhost:8787/chronicle/events/evt_20251113120000_abc123
```

#### Test Package Event History

```bash
# Get all events for a package
curl http://localhost:8787/chronicle/packages/@chittyos/test-package/events
```

### 3. Registry Service

#### Test Package Registration

```bash
# Register package
curl -X POST http://localhost:8787/registry/api/packages/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-key-123" \
  -d '{
    "package_name": "@chittyos/test-package",
    "version": "1.0.0",
    "cert_id": "CERT-PKG-20251113-001",
    "chronicle_event_id": "evt_20251113120000_abc123",
    "status": "certified"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "reg_id": "reg_1699876543210_abc123",
  "package_name": "@chittyos/test-package",
  "version": "1.0.0",
  "registry_url": "https://registry.chitty.cc/packages/@chittyos/test-package/1.0.0",
  "registered_at": "2025-11-13T12:00:00.000Z"
}
```

#### Test Package Lookup

```bash
# Get package details
curl http://localhost:8787/registry/packages/@chittyos/test-package/1.0.0

# List all versions
curl http://localhost:8787/registry/packages/@chittyos/test-package

# List all packages
curl http://localhost:8787/registry/packages
```

---

## 🎭 User Experience (UX) Testing

### UX Criteria

#### ✅ **Discoverability**
- [ ] Service info endpoints return comprehensive operation lists
- [ ] API responses include relevant URLs for next actions
- [ ] Error messages include actionable guidance
- [ ] Documentation is findable via search

**Test:**
```bash
# Service should list all endpoints
curl http://localhost:8787/chronicle | jq '.endpoints'
curl http://localhost:8787/registry | jq '.endpoints'
```

#### ✅ **Error Handling**
- [ ] Clear error codes (e.g., `CERTIFICATE_NOT_FOUND`)
- [ ] Human-readable error messages
- [ ] Guidance on how to resolve errors
- [ ] Consistent error format across services

**Test:**
```bash
# Test invalid certificate
curl http://localhost:3000/v1/certificates/verify/INVALID-CERT

# Expected:
# {
#   "valid": false,
#   "error": "CERTIFICATE_NOT_FOUND"
# }
```

#### ✅ **Response Quality**
- [ ] Responses include timestamps
- [ ] Responses include verification URLs
- [ ] Responses include next-action guidance
- [ ] JSON is properly formatted

**Test:**
```bash
# Response should include helpful URLs
curl http://localhost:3000/v1/certificates/issue ... | jq '.verify_url'
```

#### ✅ **Documentation**
- [ ] README files exist for all services
- [ ] API documentation is up-to-date
- [ ] Examples are provided
- [ ] Search is possible

**Test:**
```bash
# Check documentation exists
ls -la docs/
ls -la chittyid-server/README.md
ls -la chittyos-api-gateway/README.md
```

---

## 🔄 Integration Testing

### End-to-End Publishing Flow

#### Step-by-Step Test

```bash
#!/bin/bash
# Full publishing flow test

# 1. Issue certificate
CERT_RESPONSE=$(curl -s -X POST http://localhost:3000/v1/certificates/issue \
  -H "X-API-Key: dev-key-123" \
  -H "Content-Type: application/json" \
  -d '{"type":"package","package_name":"@chittyos/test","version":"1.0.0"}')

CERT_ID=$(echo "$CERT_RESPONSE" | jq -r '.cert_id')
echo "✓ Certificate issued: $CERT_ID"

# 2. Verify certificate
curl -s http://localhost:3000/v1/certificates/verify/$CERT_ID | jq '.valid'
echo "✓ Certificate verified"

# 3. Record build event
EVENT_RESPONSE=$(curl -s -X POST http://localhost:8787/chronicle/events \
  -H "Authorization: Bearer dev-key-123" \
  -H "Content-Type: application/json" \
  -d "{\"event_type\":\"package.build.complete\",\"package\":\"@chittyos/test\",\"version\":\"1.0.0\",\"cert_id\":\"$CERT_ID\"}")

EVENT_ID=$(echo "$EVENT_RESPONSE" | jq -r '.event_id')
echo "✓ Event recorded: $EVENT_ID"

# 4. Register package
REG_RESPONSE=$(curl -s -X POST http://localhost:8787/registry/api/packages/register \
  -H "Authorization: Bearer dev-key-123" \
  -H "Content-Type: application/json" \
  -d "{\"package_name\":\"@chittyos/test\",\"version\":\"1.0.0\",\"cert_id\":\"$CERT_ID\",\"chronicle_event_id\":\"$EVENT_ID\",\"status\":\"certified\"}")

REG_ID=$(echo "$REG_RESPONSE" | jq -r '.reg_id')
echo "✓ Package registered: $REG_ID"

# 5. Verify complete registration
curl -s http://localhost:8787/registry/packages/@chittyos/test/1.0.0 | jq '.'
echo "✓ Complete flow successful!"
```

---

## 🐛 Debugging Tests

### Common Issues

#### Issue: Services not responding
```bash
# Check if services are running
lsof -i :3000  # ChittyID
lsof -i :8787  # API Gateway

# Check logs
tail -f chittyid-server/logs/*.log
npx wrangler tail  # For Cloudflare Workers
```

#### Issue: Authentication failures
```bash
# Verify API key
echo $CHITTY_API_KEY

# Check server accepts the key
grep "dev-key-123" chittyid-server/server.js
```

#### Issue: KV namespace not configured
```bash
# Check wrangler.toml
cat chittyos-api-gateway/wrangler.toml | grep kv_namespaces

# Bind KV in development
npx wrangler dev --local
```

---

## ✅ Test Checklist

### Before Running Tests

- [ ] All services are running
- [ ] Environment variables are set
- [ ] Test data is prepared
- [ ] Dependencies are installed

### Health Checks

- [ ] ChittyID server responds at `/health`
- [ ] API Gateway responds at `/health`
- [ ] Service info endpoints return data

### Certificate Tests

- [ ] Can issue certificate
- [ ] Can verify certificate
- [ ] Can get certificate details
- [ ] Can list package certificates
- [ ] Invalid cert returns proper error

### Chronicle Tests

- [ ] Can create event
- [ ] Can retrieve event
- [ ] Can get package event history
- [ ] Package events are indexed
- [ ] Invalid event type is rejected

### Registry Tests

- [ ] Can register package
- [ ] Can get package details
- [ ] Can list package versions
- [ ] Can list all packages
- [ ] Can update package status

### Integration Tests

- [ ] Full publishing flow works
- [ ] All IDs link correctly
- [ ] URLs are accessible
- [ ] Data persists correctly

### UX Tests

- [ ] Error messages are clear
- [ ] Response times are acceptable
- [ ] Documentation is accurate
- [ ] APIs are discoverable

---

## 📊 Test Metrics

### Success Criteria

| Metric | Target | Current |
|--------|--------|---------|
| Test Pass Rate | ≥ 95% | TBD |
| Response Time (p95) | < 500ms | TBD |
| Error Rate | < 1% | TBD |
| API Availability | ≥ 99.9% | TBD |
| Documentation Coverage | 100% | 100% ✅ |

### Performance Benchmarks

```bash
# Benchmark certificate issuance
time curl -X POST http://localhost:3000/v1/certificates/issue ...

# Benchmark event creation
time curl -X POST http://localhost:8787/chronicle/events ...

# Benchmark package lookup
time curl http://localhost:8787/registry/packages/@chittyos/test/1.0.0
```

---

## 🎯 Next Steps

### After Successful Local Testing

1. **Deploy to Staging**
   - Update environment variables
   - Run full test suite
   - Validate integrations

2. **Test GitHub Actions Workflow**
   - Create test release
   - Monitor workflow execution
   - Verify package metadata

3. **Production Deployment**
   - Configure secrets
   - Update DNS/routing
   - Monitor first publishes

---

## 📞 Support

If tests fail or you encounter issues:

1. **Check logs:** Service logs provide detailed error info
2. **Review documentation:** `docs/NPM_PUBLISHING_ARCHITECTURE.md`
3. **Run validation:** `bash scripts/validate-certificate-publishing.sh`
4. **Check search guide:** `docs/SEARCH_AND_DISCOVERY.md`

**Contact:** governance@chittyos.com
