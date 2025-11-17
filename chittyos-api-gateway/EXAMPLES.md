# ChittyOS API Gateway - Example Requests

## Quick Reference

### Base URLs
- **Production:** `https://api.chitty.cc`
- **ChittyAuth:** `https://chittyauth-mcp-121.chittycorp-llc.workers.dev`
- **ChittyID:** `https://id.chitty.cc`

## Authentication Examples

### 1. Generate JWT Token

```bash
curl -X POST https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/jwt/generate \
  -H "Content-Type: application/json" \
  -H "X-ChittyID: chitty_usr_yourchittyid" \
  -d '{
    "expires_in": "1h",
    "claims": {
      "scopes": ["chronicle:write", "registry:write", "registry:read"]
    }
  }'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2025-11-15T20:00:00Z",
  "chitty_id": "chitty_usr_yourchittyid",
  "scopes": ["chronicle:write", "registry:write", "registry:read"]
}
```

### 2. Generate API Key

```bash
curl -X POST https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/api/keys \
  -H "Content-Type: application/json" \
  -H "X-ChittyID: chitty_usr_yourchittyid" \
  -d '{
    "name": "CI/CD Pipeline",
    "scopes": ["chronicle:write", "registry:read"]
  }'
```

**Response:**
```json
{
  "api_key": "chitty_key_abc123def456...",
  "name": "CI/CD Pipeline",
  "scopes": ["chronicle:write", "registry:read"],
  "created_at": "2025-11-15T19:00:00Z"
}
```

### 3. Validate Token

```bash
curl -X POST https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/jwt/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "token": "YOUR_TOKEN"
  }'
```

**Response:**
```json
{
  "valid": true,
  "chitty_id": "chitty_usr_yourchittyid",
  "scopes": ["chronicle:write", "registry:write"],
  "expires_at": "2025-11-15T20:00:00Z"
}
```

## Chronicle Service Examples

### Public Endpoints (No Auth)

#### Get Event History
```bash
curl https://api.chitty.cc/chronicle/events?limit=10&offset=0
```

#### Get Specific Event
```bash
curl https://api.chitty.cc/chronicle/events/evt_20251115190000_abc123
```

#### Get Package Events
```bash
curl https://api.chitty.cc/chronicle/packages/@chittyos/example/events
```

### Protected Endpoints (Auth Required)

#### Create Event
```bash
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "package.published",
    "package": "@chittyos/example",
    "version": "1.0.0",
    "metadata": {
      "publisher": "ChittyOS CI/CD",
      "build_id": "build_123"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "event_id": "evt_20251115190000_abc123",
  "chronicle_url": "https://api.chitty.cc/chronicle/events/evt_20251115190000_abc123",
  "timestamp": "2025-11-15T19:00:00Z"
}
```

#### Create Build Event
```bash
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "package.build.complete",
    "package": "@chittyos/example",
    "version": "1.0.0",
    "metadata": {
      "build_duration": "45s",
      "test_results": "passed"
    }
  }'
```

#### Create Certificate Issued Event
```bash
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "package.certificate.issued",
    "package": "@chittyos/example",
    "version": "1.0.0",
    "metadata": {
      "cert_id": "cert_abc123",
      "issuer": "ChittyOS Quality Assurance"
    }
  }'
```

## Registry Service Examples

### Public Endpoints (No Auth)

#### List All Packages
```bash
curl https://api.chitty.cc/registry/packages
```

**Response:**
```json
{
  "packages": [
    {
      "package_name": "@chittyos/example",
      "latest_version": "1.0.0",
      "registered_at": "2025-11-15T19:00:00Z"
    }
  ],
  "total": 1
}
```

#### Get Package Versions
```bash
curl https://api.chitty.cc/registry/packages/@chittyos/example
```

**Response:**
```json
{
  "package_name": "@chittyos/example",
  "versions": [
    {
      "version": "1.0.0",
      "reg_id": "reg_123",
      "cert_id": "cert_abc123",
      "status": "certified",
      "registered_at": "2025-11-15T19:00:00Z"
    }
  ],
  "total": 1
}
```

#### Get Specific Package Version
```bash
curl https://api.chitty.cc/registry/packages/@chittyos/example/1.0.0
```

**Response:**
```json
{
  "reg_id": "reg_123",
  "package_name": "@chittyos/example",
  "version": "1.0.0",
  "cert_id": "cert_abc123",
  "status": "certified",
  "registered_at": "2025-11-15T19:00:00Z",
  "registered_by": "chitty_usr_abc123",
  "metadata": {
    "authenticated_chitty_id": "chitty_usr_abc123",
    "authenticated_scopes": ["registry:write"]
  }
}
```

### Protected Endpoints (Auth Required)

#### Register Package
```bash
curl -X POST https://api.chitty.cc/registry/api/packages/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "package_name": "@chittyos/example",
    "version": "1.0.0",
    "cert_id": "cert_abc123",
    "status": "certified",
    "metadata": {
      "description": "Example ChittyOS package",
      "repository": "https://github.com/chittyos/example"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "reg_id": "reg_123",
  "package_name": "@chittyos/example",
  "version": "1.0.0",
  "registry_url": "https://registry.chitty.cc/packages/@chittyos/example/1.0.0",
  "registered_at": "2025-11-15T19:00:00Z"
}
```

#### Update Package Status
```bash
curl -X PUT https://api.chitty.cc/registry/packages/@chittyos/example/1.0.0/status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "deprecated",
    "reason": "Security vulnerability discovered"
  }'
```

**Response:**
```json
{
  "success": true,
  "package_name": "@chittyos/example",
  "version": "1.0.0",
  "status": "deprecated",
  "updated_at": "2025-11-15T19:30:00Z"
}
```

## Health & Status Endpoints

### Health Check
```bash
curl https://api.chitty.cc/health
```

**Response:**
```
OK
```

### Service Status
```bash
curl https://api.chitty.cc/status
```

**Response:**
```json
{
  "status": "operational",
  "services": 5,
  "timestamp": "2025-11-15T19:00:00Z",
  "version": "1.0.0"
}
```

## Error Handling Examples

### 401 Unauthorized (Missing Token)
```bash
curl -X POST https://api.chitty.cc/chronicle/events \
  -H "Content-Type: application/json" \
  -d '{"event_type": "test"}'
```

**Response:**
```json
{
  "error": "Unauthorized",
  "message": "Authentication required",
  "hint": "Provide a valid Bearer token, API key, or service token"
}
```

### 403 Forbidden (Insufficient Scopes)
```bash
# Token only has chronicle:write, but trying to register package
curl -X POST https://api.chitty.cc/registry/api/packages/register \
  -H "Authorization: Bearer TOKEN_WITH_WRONG_SCOPES" \
  -H "Content-Type: application/json" \
  -d '{
    "package_name": "@chittyos/example",
    "version": "1.0.0",
    "cert_id": "cert_abc123"
  }'
```

**Response:**
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions. Required scope: registry:write",
  "required_scopes": ["registry:write"],
  "user_scopes": ["chronicle:write"]
}
```

### 400 Bad Request (Missing Fields)
```bash
curl -X POST https://api.chitty.cc/registry/api/packages/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "package_name": "@chittyos/example"
  }'
```

**Response:**
```json
{
  "error": "MISSING_REQUIRED_FIELDS",
  "message": "package_name, version, and cert_id are required"
}
```

## Complete Workflow Example

### Package Publishing Workflow

```bash
#!/bin/bash

# Configuration
CHITTY_ID="chitty_usr_yourchittyid"
PACKAGE_NAME="@chittyos/example"
PACKAGE_VERSION="1.0.0"

# Step 1: Generate authentication token
echo "Step 1: Generating authentication token..."
TOKEN=$(curl -s -X POST https://chittyauth-mcp-121.chittycorp-llc.workers.dev/v1/jwt/generate \
  -H "Content-Type: application/json" \
  -H "X-ChittyID: $CHITTY_ID" \
  -d '{
    "expires_in": "1h",
    "claims": {
      "scopes": ["chronicle:write", "registry:write"]
    }
  }' | jq -r '.token')

echo "Token obtained: ${TOKEN:0:20}..."

# Step 2: Create build start event
echo "Step 2: Creating build start event..."
BUILD_EVENT=$(curl -s -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"event_type\": \"package.build.start\",
    \"package\": \"$PACKAGE_NAME\",
    \"version\": \"$PACKAGE_VERSION\"
  }")

echo "Build event created: $(echo $BUILD_EVENT | jq -r '.event_id')"

# Step 3: Create build complete event
echo "Step 3: Creating build complete event..."
curl -s -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"event_type\": \"package.build.complete\",
    \"package\": \"$PACKAGE_NAME\",
    \"version\": \"$PACKAGE_VERSION\",
    \"metadata\": {
      \"build_duration\": \"45s\",
      \"test_results\": \"passed\"
    }
  }" | jq

# Step 4: Register package
echo "Step 4: Registering package..."
REGISTRATION=$(curl -s -X POST https://api.chitty.cc/registry/api/packages/register \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"package_name\": \"$PACKAGE_NAME\",
    \"version\": \"$PACKAGE_VERSION\",
    \"cert_id\": \"cert_abc123\",
    \"status\": \"certified\"
  }")

echo "Package registered: $(echo $REGISTRATION | jq -r '.registry_url')"

# Step 5: Create published event
echo "Step 5: Creating published event..."
curl -s -X POST https://api.chitty.cc/chronicle/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"event_type\": \"package.published\",
    \"package\": \"$PACKAGE_NAME\",
    \"version\": \"$PACKAGE_VERSION\",
    \"metadata\": {
      \"registry_url\": \"$(echo $REGISTRATION | jq -r '.registry_url')\"
    }
  }" | jq

echo "Workflow complete!"
```

## JavaScript/TypeScript Examples

### Node.js with fetch

```javascript
const API_BASE = 'https://api.chitty.cc';
const AUTH_BASE = 'https://chittyauth-mcp-121.chittycorp-llc.workers.dev';

// Generate token
async function getToken(chittyId, scopes) {
  const response = await fetch(`${AUTH_BASE}/v1/jwt/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ChittyID': chittyId,
    },
    body: JSON.stringify({
      expires_in: '1h',
      claims: { scopes },
    }),
  });

  const data = await response.json();
  return data.token;
}

// Create event
async function createEvent(token, eventData) {
  const response = await fetch(`${API_BASE}/chronicle/events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Event creation failed: ${error.message}`);
  }

  return await response.json();
}

// Register package
async function registerPackage(token, packageData) {
  const response = await fetch(`${API_BASE}/registry/api/packages/register`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(packageData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Package registration failed: ${error.message}`);
  }

  return await response.json();
}

// Usage
(async () => {
  try {
    const token = await getToken('chitty_usr_abc123', [
      'chronicle:write',
      'registry:write',
    ]);

    const event = await createEvent(token, {
      event_type: 'package.published',
      package: '@chittyos/example',
      version: '1.0.0',
    });

    console.log('Event created:', event);

    const registration = await registerPackage(token, {
      package_name: '@chittyos/example',
      version: '1.0.0',
      cert_id: 'cert_abc123',
    });

    console.log('Package registered:', registration);
  } catch (error) {
    console.error('Error:', error.message);
  }
})();
```

## Environment-Specific Examples

### Development (Localhost)

```bash
# Using local development server
export API_BASE="http://localhost:8787"
export TOKEN="dev_token_123"

curl -X POST $API_BASE/chronicle/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_type": "test"}'
```

### Staging

```bash
export API_BASE="https://api-staging.chitty.cc"
export TOKEN="staging_token_123"

curl -X POST $API_BASE/chronicle/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_type": "test"}'
```

### Production

```bash
export API_BASE="https://api.chitty.cc"
export TOKEN="prod_token_123"

curl -X POST $API_BASE/chronicle/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_type": "package.published", "package": "@chittyos/example", "version": "1.0.0"}'
```

---

**Generated with ChittyOS API Gateway v1.0.0**
**Last Updated:** 2025-11-15
