/**
 * End-to-End Tests for ChittyOS Certificate-Based NPM Publishing
 * Tests all endpoints, workflows, and user flows
 */

const fetch = require('node-fetch');
const crypto = require('crypto');

// Test configuration
const CONFIG = {
  CHITTY_ID_SERVICE: process.env.CHITTY_ID_SERVICE || 'http://localhost:3000',
  CHITTY_API_GATEWAY: process.env.CHITTY_API_GATEWAY || 'http://localhost:8787',
  CHITTY_REGISTRY: process.env.CHITTY_REGISTRY || 'http://localhost:8787',
  API_KEY: process.env.CHITTY_API_KEY || 'dev-key-123',
  TEST_PACKAGE: '@chittyos/test-package',
  TEST_VERSION: '1.0.0',
};

// Test state
let testState = {
  cert_id: null,
  chitty_id: null,
  event_id: null,
  reg_id: null,
};

// Helper: Generate timestamp and nonce for replay protection
function generateReplayProtection() {
  return {
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  };
}

// Helper: Calculate content hash
function calculateContentHash(content) {
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
}

// Test Suite
async function runTests() {
  console.log('🧪 Starting ChittyOS Certificate Publishing E2E Tests\n');
  console.log('Configuration:', CONFIG, '\n');

  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  // Test 1: ChittyID Server Health Check
  await test(results, 'ChittyID Server Health Check', async () => {
    const response = await fetch(`${CONFIG.CHITTY_ID_SERVICE}/health`);
    const data = await response.json();

    assert(response.ok, 'Health check should return 200');
    assert(data.status === 'healthy', 'Status should be healthy');
    assert(data.service === 'ChittyID Server', 'Service name should be correct');

    return data;
  });

  // Test 2: API Gateway Health Check
  await test(results, 'API Gateway Health Check', async () => {
    const response = await fetch(`${CONFIG.CHITTY_API_GATEWAY}/health`);

    assert(response.ok, 'Health check should return 200');

    return { status: 'ok' };
  });

  // Test 3: ChittyID - Mint Package ChittyID (for certificate)
  await test(results, 'ChittyID - Mint Package Identity', async () => {
    const contentHash = calculateContentHash(`${CONFIG.TEST_PACKAGE}@${CONFIG.TEST_VERSION}`);
    const replayProtection = generateReplayProtection();

    const response = await fetch(`${CONFIG.CHITTY_ID_SERVICE}/api/v2/chittyid/mint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CONFIG.API_KEY,
      },
      body: JSON.stringify({
        content_hash: contentHash,
        namespace: 'DOC',
        type: 'I',
        metadata: {
          package_name: CONFIG.TEST_PACKAGE,
          version: CONFIG.TEST_VERSION,
          test: true,
        },
        ...replayProtection,
      }),
    });

    const data = await response.json();

    assert(response.ok, `Mint should succeed (${response.status}): ${JSON.stringify(data)}`);
    assert(data.chitty_id, 'Should return chitty_id');
    assert(data.status_block, 'Should return status block');

    testState.chitty_id = data.chitty_id;

    return data;
  });

  // Test 4: Certificate Issuance
  await test(results, 'Certificate - Issue Package Certificate', async () => {
    const response = await fetch(`${CONFIG.CHITTY_ID_SERVICE}/v1/certificates/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CONFIG.API_KEY,
      },
      body: JSON.stringify({
        type: 'package',
        package_name: CONFIG.TEST_PACKAGE,
        version: CONFIG.TEST_VERSION,
        requester: {
          github_user: 'test-user',
          workflow_run: 'test-123',
        },
        governance_approval: 'test-approval',
      }),
    });

    const data = await response.json();

    assert(response.status === 200 || response.status === 201, `Certificate issuance should succeed (${response.status}): ${JSON.stringify(data)}`);
    assert(data.cert_id, 'Should return cert_id');
    assert(data.chitty_id, 'Should return chitty_id');
    assert(data.fingerprint, 'Should return fingerprint');
    assert(data.pem, 'Should return PEM certificate');
    assert(data.public_key, 'Should return public key');
    assert(data.private_key, 'Should return private key (once)');

    testState.cert_id = data.cert_id;

    return data;
  });

  // Test 5: Certificate Verification
  await test(results, 'Certificate - Verify Certificate', async () => {
    const response = await fetch(`${CONFIG.CHITTY_ID_SERVICE}/v1/certificates/verify/${testState.cert_id}`);
    const data = await response.json();

    assert(response.ok, 'Verification should succeed');
    assert(data.valid === true, 'Certificate should be valid');
    assert(data.certificate, 'Should return certificate details');
    assert(data.certificate.cert_id === testState.cert_id, 'Cert ID should match');

    return data;
  });

  // Test 6: Get Certificate Details
  await test(results, 'Certificate - Get Certificate Details', async () => {
    const response = await fetch(`${CONFIG.CHITTY_ID_SERVICE}/v1/certificates/${testState.cert_id}`, {
      headers: {
        'X-API-Key': CONFIG.API_KEY,
      },
    });
    const data = await response.json();

    assert(response.ok, 'Get certificate should succeed');
    assert(data.cert_id === testState.cert_id, 'Cert ID should match');
    assert(data.pem, 'Should include PEM');
    assert(!data.private_key, 'Should NOT include private key');

    return data;
  });

  // Test 7: Chronicle - Record Build Event
  await test(results, 'Chronicle - Record Package Build Event', async () => {
    const response = await fetch(`${CONFIG.CHITTY_API_GATEWAY}/chronicle/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
      },
      body: JSON.stringify({
        event_type: 'package.build.complete',
        package: CONFIG.TEST_PACKAGE,
        version: CONFIG.TEST_VERSION,
        cert_id: testState.cert_id,
        artifacts: {
          tarball_hash: 'sha256:test123',
          size_bytes: 12345,
          build_timestamp: new Date().toISOString(),
        },
        metadata: {
          builder: 'test-suite',
          test: true,
        },
      }),
    });

    const data = await response.json();

    assert(response.status === 200 || response.status === 201, `Chronicle event creation should succeed (${response.status}): ${JSON.stringify(data)}`);
    assert(data.event_id, 'Should return event_id');
    assert(data.chronicle_url, 'Should return chronicle_url');

    testState.event_id = data.event_id;

    return data;
  });

  // Test 8: Chronicle - Get Event
  await test(results, 'Chronicle - Retrieve Event', async () => {
    const response = await fetch(`${CONFIG.CHITTY_API_GATEWAY}/chronicle/events/${testState.event_id}`);
    const data = await response.json();

    assert(response.ok, 'Get event should succeed');
    assert(data.id === testState.event_id, 'Event ID should match');
    assert(data.type === 'package.build.complete', 'Event type should match');

    return data;
  });

  // Test 9: Chronicle - Get Package Event History
  await test(results, 'Chronicle - Get Package Event History', async () => {
    const encodedPackage = encodeURIComponent(CONFIG.TEST_PACKAGE);
    const response = await fetch(`${CONFIG.CHITTY_API_GATEWAY}/chronicle/packages/${encodedPackage}/events`);
    const data = await response.json();

    assert(response.ok, 'Get package events should succeed');
    assert(data.package === CONFIG.TEST_PACKAGE, 'Package name should match');
    assert(Array.isArray(data.events), 'Should return events array');
    assert(data.events.length > 0, 'Should have at least one event');

    return data;
  });

  // Test 10: Registry - Register Package
  await test(results, 'Registry - Register Package', async () => {
    const response = await fetch(`${CONFIG.CHITTY_REGISTRY}/registry/api/packages/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
      },
      body: JSON.stringify({
        package_name: CONFIG.TEST_PACKAGE,
        version: CONFIG.TEST_VERSION,
        cert_id: testState.cert_id,
        chronicle_event_id: testState.event_id,
        r2_location: `chitty-processed-docs/packages/${CONFIG.TEST_PACKAGE}/${CONFIG.TEST_VERSION}.tgz`,
        npm_registry: 'https://registry.npmjs.org',
        status: 'certified',
        metadata: {
          test: true,
        },
      }),
    });

    const data = await response.json();

    assert(response.status === 200 || response.status === 201, `Registry registration should succeed (${response.status}): ${JSON.stringify(data)}`);
    assert(data.success === true, 'Should return success=true');
    assert(data.reg_id, 'Should return reg_id');
    assert(data.registry_url, 'Should return registry_url');

    testState.reg_id = data.reg_id;

    return data;
  });

  // Test 11: Registry - Get Package Details
  await test(results, 'Registry - Get Package Details', async () => {
    const encodedPackage = encodeURIComponent(CONFIG.TEST_PACKAGE);
    const response = await fetch(`${CONFIG.CHITTY_REGISTRY}/registry/packages/${encodedPackage}/${CONFIG.TEST_VERSION}`);
    const data = await response.json();

    assert(response.ok, 'Get package should succeed');
    assert(data.package_name === CONFIG.TEST_PACKAGE, 'Package name should match');
    assert(data.version === CONFIG.TEST_VERSION, 'Version should match');
    assert(data.cert_id === testState.cert_id, 'Cert ID should match');

    return data;
  });

  // Test 12: Registry - List Package Versions
  await test(results, 'Registry - List Package Versions', async () => {
    const encodedPackage = encodeURIComponent(CONFIG.TEST_PACKAGE);
    const response = await fetch(`${CONFIG.CHITTY_REGISTRY}/registry/packages/${encodedPackage}`);
    const data = await response.json();

    assert(response.ok, 'List versions should succeed');
    assert(data.package_name === CONFIG.TEST_PACKAGE, 'Package name should match');
    assert(Array.isArray(data.versions), 'Should return versions array');
    assert(data.versions.length > 0, 'Should have at least one version');

    return data;
  });

  // Test 13: Registry - Update Package Status
  await test(results, 'Registry - Update Package Status', async () => {
    const encodedPackage = encodeURIComponent(CONFIG.TEST_PACKAGE);
    const response = await fetch(
      `${CONFIG.CHITTY_REGISTRY}/registry/packages/${encodedPackage}/${CONFIG.TEST_VERSION}/status`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.API_KEY}`,
        },
        body: JSON.stringify({
          status: 'published',
          reason: 'Test update',
        }),
      }
    );

    const data = await response.json();

    assert(response.ok, 'Status update should succeed');
    assert(data.success === true, 'Should return success=true');
    assert(data.status === 'published', 'Status should be updated');

    return data;
  });

  // Test 14: List All Packages
  await test(results, 'Registry - List All Packages', async () => {
    const response = await fetch(`${CONFIG.CHITTY_REGISTRY}/registry/packages`);
    const data = await response.json();

    assert(response.ok, 'List packages should succeed');
    assert(Array.isArray(data.packages), 'Should return packages array');

    return data;
  });

  // Test 15: Certificate - List Package Certificates
  await test(results, 'Certificate - List Package Certificates', async () => {
    const encodedPackage = encodeURIComponent(CONFIG.TEST_PACKAGE);
    const response = await fetch(
      `${CONFIG.CHITTY_ID_SERVICE}/v1/certificates/package/${encodedPackage}`,
      {
        headers: {
          'X-API-Key': CONFIG.API_KEY,
        },
      }
    );
    const data = await response.json();

    assert(response.ok, 'List certificates should succeed');
    assert(data.package_name === CONFIG.TEST_PACKAGE, 'Package name should match');
    assert(Array.isArray(data.certificates), 'Should return certificates array');
    assert(data.certificates.length > 0, 'Should have at least one certificate');

    return data;
  });

  // Test 16: Chronicle Service Info
  await test(results, 'Chronicle - Service Info', async () => {
    const response = await fetch(`${CONFIG.CHITTY_API_GATEWAY}/chronicle`);
    const data = await response.json();

    assert(response.ok, 'Service info should succeed');
    assert(data.service === 'ChittyOS Chronicle', 'Service name should match');
    assert(Array.isArray(data.endpoints), 'Should list endpoints');
    assert(Array.isArray(data.package_event_types), 'Should list event types');

    return data;
  });

  // Test 17: Registry Service Info
  await test(results, 'Registry - Service Info', async () => {
    const response = await fetch(`${CONFIG.CHITTY_REGISTRY}/registry`);
    const data = await response.json();

    assert(response.ok, 'Service info should succeed');
    assert(data.service === 'ChittyOS Registry', 'Service name should match');
    assert(Array.isArray(data.endpoints), 'Should list endpoints');

    return data;
  });

  // Print Results
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Total:  ${results.tests.length}`);
  console.log(`🎯 Success Rate: ${((results.passed / results.tests.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(60) + '\n');

  // Print Test State
  console.log('🔑 Test State:');
  console.log(JSON.stringify(testState, null, 2));
  console.log('');

  // Print Failed Tests
  if (results.failed > 0) {
    console.log('❌ Failed Tests:');
    results.tests
      .filter((t) => !t.passed)
      .forEach((t) => {
        console.log(`  - ${t.name}`);
        console.log(`    Error: ${t.error}`);
      });
    console.log('');
  }

  // Exit code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Test helper
async function test(results, name, fn) {
  process.stdout.write(`🧪 ${name}... `);
  try {
    const result = await fn();
    console.log('✅ PASS');
    results.passed++;
    results.tests.push({ name, passed: true, result });
  } catch (error) {
    console.log('❌ FAIL');
    console.log(`   Error: ${error.message}`);
    results.failed++;
    results.tests.push({ name, passed: false, error: error.message });
  }
}

// Assert helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
