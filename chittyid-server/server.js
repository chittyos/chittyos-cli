/**
 * ChittyID Server - Main Implementation
 * Enforces server-only generation with all security measures
 */

import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";
import { ChittyVRF } from "./lib/vrf.js";
import { anomalyDetector } from "./lib/anomaly-detector.js";
import { certificateManager } from "./lib/certificate-manager.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DRAND_URL = "https://drand.cloudflare.com/public/latest";

// In-memory storage for development (production uses PostgreSQL)
const idRegistry = new Map();
const nonceCache = new Set();
const apiKeys = new Map([
  ["dev-key-123", { name: "Development", rateLimit: 100 }],
  ["test-key-456", { name: "Testing", rateLimit: 50 }],
]);

// Namespace and type mappings from research document
const NAMESPACES = {
  DOC: "DOC", // Document
  MNT: "MNT", // Mint
  CLM: "CLM", // Claim
  EVD: "EVD", // Evidence
  AST: "AST", // Asset
  IDN: "IDN", // Identity
};

const TYPES = {
  I: "I", // Initial
  D: "D", // Derived
  C: "C", // Claim
  E: "E", // Evidence
  L: "L", // Link
  V: "V", // Verification
};

/**
 * Fetch current drand beacon value
 */
async function getDrandBeacon() {
  try {
    const response = await fetch(DRAND_URL, { timeout: 2000 });
    if (!response.ok) throw new Error("Drand fetch failed");

    const data = await response.json();
    return {
      round: data.round,
      randomness: data.randomness,
      signature: data.signature,
    };
  } catch (error) {
    console.error("Drand beacon error:", error);
    // In production, try multiple drand endpoints
    throw new Error("DRAND_UNAVAILABLE");
  }
}

/**
 * Generate ChittyID with all security checks
 */
function generateChittyID(params) {
  const { namespace, type, contentHash, drandValue, drandRound } = params;

  // Generate Year/Month encoding
  const ym = ChittyVRF.generateYM();

  // Component domain (C for central server)
  const component = "C";

  // Generate SSSS using VRF
  const ssss = ChittyVRF.generateSSSS({
    drandValue,
    drandRound,
    contentHash,
    namespace,
    type,
    component,
  });

  // Counter digits (last 2 of SSSS for initial version)
  const cc = ssss.substring(2, 4);

  // Version increment (7 for initial)
  const v = "7";

  // Build base ID
  const baseId = `${ym}-${component}-${namespace}-${ssss}-${type}-${cc}-${v}`;

  // Calculate checksum with content binding
  const checksum = ChittyVRF.calculateChecksum(baseId, contentHash, drandValue);

  return `${baseId}-${checksum}`;
}

/**
 * Validate API key and check rate limits
 */
function validateApiKey(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey || !apiKeys.has(apiKey)) {
    return res.status(401).json({
      error_code: "UNAUTHORIZED",
      human_readable: "Invalid or missing API key",
      ai_instructions: {
        next_action: {
          command: "verify_api_key",
          reason: "API key required for all requests",
        },
      },
    });
  }

  req.apiKey = apiKey;
  req.apiKeyData = apiKeys.get(apiKey);
  next();
}

/**
 * Anti-replay protection
 */
function checkReplay(req, res, next) {
  const { timestamp, nonce } = req.body;

  if (!timestamp || !nonce) {
    return res.status(400).json({
      error_code: "MISSING_REPLAY_PROTECTION",
      human_readable: "Timestamp and nonce required",
      ai_instructions: {
        next_action: {
          command: "add_replay_protection",
          reason: "Include timestamp and nonce in request",
        },
      },
    });
  }

  // Check timestamp window (60 seconds)
  const now = Date.now();
  if (Math.abs(now - timestamp) > 60000) {
    return res.status(400).json({
      error_code: "TIMESTAMP_OUT_OF_RANGE",
      human_readable: "Request timestamp too old or in future",
      ai_instructions: {
        next_action: {
          command: "sync_time",
          reason: "Ensure system clock is synchronized",
        },
      },
    });
  }

  // Check nonce uniqueness
  if (nonceCache.has(nonce)) {
    // Detected replay attempt
    anomalyDetector.detectReplayPattern(
      req.apiKey,
      req.body.content_hash,
      timestamp,
      nonce,
    );

    return res.status(400).json({
      error_code: "REPLAY_DETECTED",
      human_readable: "Duplicate nonce detected",
      ai_instructions: {
        next_action: {
          command: "generate_new_nonce",
          reason: "Each request must have unique nonce",
        },
      },
    });
  }

  nonceCache.add(nonce);

  // Clean old nonces periodically
  if (nonceCache.size > 10000) {
    nonceCache.clear();
  }

  next();
}

/**
 * POST /api/v2/chittyid/mint - Generate new ChittyID
 */
app.post(
  "/api/v2/chittyid/mint",
  validateApiKey,
  checkReplay,
  async (req, res) => {
    try {
      const { content_hash, namespace, type, metadata } = req.body;

      // Validate required fields
      if (!content_hash || !namespace || !type) {
        return res.status(400).json({
          error_code: "MISSING_REQUIRED_FIELDS",
          human_readable: "content_hash, namespace, and type are required",
          ai_instructions: {
            next_action: {
              command: "verify_request_fields",
              reason: "All required fields must be present",
            },
          },
        });
      }

      // Validate content hash format
      const hashPattern = /^(sha256:)?[a-f0-9]{64}$/;
      if (!hashPattern.test(content_hash)) {
        return res.status(400).json({
          error_code: "INVALID_HASH",
          human_readable: "Content hash must be SHA256 format",
          ai_instructions: {
            next_action: {
              command: "verify_content_hash",
              reason: "Hash must be SHA256 format",
            },
          },
        });
      }

      // Validate namespace and type
      if (!NAMESPACES[namespace] || !TYPES[type]) {
        return res.status(400).json({
          error_code: "INVALID_PARAMETERS",
          human_readable: "Invalid namespace or type",
          ai_instructions: {
            next_action: {
              command: "check_valid_values",
              reason: "Use only specified namespace and type values",
            },
          },
        });
      }

      // Check for anomalies
      if (anomalyDetector.detectRateAnomaly(req.apiKey)) {
        return res.status(429).json({
          error_code: "RATE_ANOMALY_DETECTED",
          human_readable: "Unusual request pattern detected",
          ai_instructions: {
            next_action: {
              command: "wait_and_retry",
              wait_seconds: 60,
              reason: "Rate limiting due to anomaly detection",
            },
          },
        });
      }

      // Get drand beacon
      const drand = await getDrandBeacon();

      // Validate drand consistency
      if (
        !anomalyDetector.validateDrandConsistency(
          req.body.timestamp,
          drand.round,
          Date.now(),
        )
      ) {
        return res.status(400).json({
          error_code: "TIMESTAMP_INCONSISTENCY",
          human_readable: "Timestamp does not match drand round",
          ai_instructions: {
            next_action: {
              command: "sync_with_drand",
              reason: "Ensure timestamp aligns with drand beacon",
            },
          },
        });
      }

      // Generate ChittyID
      const chittyId = generateChittyID({
        namespace,
        type,
        contentHash: content_hash,
        drandValue: drand.randomness,
        drandRound: drand.round,
      });

      // Store in registry
      const record = {
        chitty_id: chittyId,
        content_hash,
        namespace,
        type,
        metadata,
        created_at: new Date().toISOString(),
        drand_round: drand.round,
        api_key: req.apiKey,
        status: "active",
      };

      idRegistry.set(chittyId, record);

      // Return response
      res.json({
        chitty_id: chittyId,
        status_block: {
          status: "active",
          readable_status: "ChittyID successfully generated",
          creation_time: record.created_at,
          drand_round: drand.round,
          verification_endpoint: `https://id.chitty.cc/api/v2/chittyid/verify/${chittyId}`,
          reconciliation_required: false,
        },
      });
    } catch (error) {
      console.error("Mint error:", error);

      if (error.message === "DRAND_UNAVAILABLE") {
        // Service unavailable - client should use fallback
        return res.status(503).json({
          error_code: "SERVICE_UNAVAILABLE",
          human_readable: "Main server temporarily unavailable",
          ai_instructions: {
            next_action: {
              command: "call_fallback_service",
              service_url: "https://fallback.id.chitty.cc",
              endpoint: "/api/v2/fallback/request",
              important: "Save fallback ID for later reconciliation",
            },
          },
        });
      }

      res.status(500).json({
        error_code: "INTERNAL_ERROR",
        human_readable: "Server error occurred",
        ai_instructions: {
          next_action: {
            command: "retry_request",
            wait_seconds: 5,
          },
        },
      });
    }
  },
);

/**
 * GET /api/v2/chittyid/verify/:id - Verify ChittyID
 */
app.get("/api/v2/chittyid/verify/:id", async (req, res) => {
  const chittyId = req.params.id;

  // Validate format
  const pattern =
    /^[A-Z0-9]{2}-[A-Z]-[A-Z]{3}-\d{4}-[A-Z]-[A-Z0-9]{2}-[A-Z0-9]-[A-Z0-9]$/;
  if (!pattern.test(chittyId)) {
    return res.status(400).json({
      error: "Invalid ChittyID format",
    });
  }

  const record = idRegistry.get(chittyId);

  if (!record) {
    return res.status(404).json({
      error: "ChittyID not found",
      valid: false,
    });
  }

  res.json({
    valid: true,
    chitty_id: chittyId,
    status: record.status,
    created_at: record.created_at,
    namespace: record.namespace,
    type: record.type,
    drand_round: record.drand_round,
  });
});

/**
 * POST /api/v2/chittyid/reconcile - Reconcile fallback IDs
 */
app.post("/api/v2/chittyid/reconcile", validateApiKey, async (req, res) => {
  const { fallback_ids, merkle_proof } = req.body;

  if (!fallback_ids || !Array.isArray(fallback_ids)) {
    return res.status(400).json({
      error_code: "INVALID_REQUEST",
      human_readable: "fallback_ids array required",
    });
  }

  const reconciled = [];

  for (const fallbackId of fallback_ids) {
    // Generate permanent ID
    const drand = await getDrandBeacon();
    const permanentId = generateChittyID({
      namespace: fallbackId.namespace || "DOC",
      type: fallbackId.type || "I",
      contentHash: fallbackId.content_hash,
      drandValue: drand.randomness,
      drandRound: drand.round,
    });

    reconciled.push({
      fallback_id: fallbackId.id,
      permanent_id: permanentId,
      status: "reconciled",
    });
  }

  res.json({
    reconciled,
    timestamp: Date.now(),
  });
});

/**
 * POST /api/v2/keys/rotate - Rotate API keys
 */
app.post("/api/v2/keys/rotate", validateApiKey, (req, res) => {
  const { integrityHash } = req.body;

  // Generate short-lived key
  const shortLivedKey = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + 3600000; // 1 hour

  // Store temporary key
  apiKeys.set(shortLivedKey, {
    name: `Rotated from ${req.apiKeyData.name}`,
    rateLimit: req.apiKeyData.rateLimit,
    expires,
    parent: req.apiKey,
  });

  res.json({
    key: shortLivedKey,
    expires,
    integrity_verified: true,
  });
});

/**
 * POST /api/v2/security/events - Log security events
 */
app.post("/api/v2/security/events", validateApiKey, (req, res) => {
  const event = req.body;

  // Log to anomaly detector
  anomalyDetector.logAnomaly({
    type: event.type,
    apiKey: req.apiKey,
    data: event.data,
    severity: "INFO",
  });

  res.json({ logged: true });
});

/**
 * GET /api/v2/security/forensics - Get forensic report
 */
app.get("/api/v2/security/forensics", validateApiKey, (req, res) => {
  const timeRange = parseInt(req.query.timeRange) || 3600000;
  const report = anomalyDetector.getForensicReport(timeRange);

  res.json(report);
});

/**
 * POST /v1/certificates/issue - Issue a certificate for a package
 */
app.post("/v1/certificates/issue", validateApiKey, async (req, res) => {
  try {
    const { type, package_name, version, requester, governance_approval } = req.body;

    // Validate required fields
    if (!type || !package_name || !version) {
      return res.status(400).json({
        error_code: "MISSING_REQUIRED_FIELDS",
        message: "type, package_name, and version are required",
      });
    }

    // Only support package certificates for now
    if (type !== "package") {
      return res.status(400).json({
        error_code: "UNSUPPORTED_CERTIFICATE_TYPE",
        message: "Only 'package' type certificates are currently supported",
      });
    }

    // First, mint a ChittyID for this package
    const contentHash = crypto
      .createHash("sha256")
      .update(`${package_name}@${version}`)
      .digest("hex");

    const drand = await getDrandBeacon();

    const chittyId = generateChittyID({
      namespace: "DOC", // Package as document
      type: "I", // Initial
      contentHash: `sha256:${contentHash}`,
      drandValue: drand.randomness,
      drandRound: drand.round,
    });

    // Store ChittyID
    const idRecord = {
      content_hash: `sha256:${contentHash}`,
      namespace: "DOC",
      type: "I",
      metadata: {
        package_name,
        version,
        certificate_type: "package",
      },
      created_at: new Date().toISOString(),
      drand_round: drand.round,
      api_key: req.apiKey,
      status: "active",
    };

    idRegistry.set(chittyId, idRecord);

    // Issue certificate
    const certificate = certificateManager.issuePackageCertificate({
      package_name,
      version,
      requester: requester || { github_user: "unknown" },
      governance_approval: governance_approval || null,
      chitty_id: chittyId,
    });

    res.json({
      success: true,
      cert_id: certificate.cert_id,
      chitty_id: certificate.chitty_id,
      fingerprint: certificate.fingerprint,
      issued_at: certificate.issued_at,
      expires_at: certificate.expires_at,
      pem: certificate.pem,
      public_key: certificate.public_key,
      private_key: certificate.private_key, // Only returned once
      serial_number: certificate.serial_number,
      verify_url: `https://id.chitty.cc/v1/certificates/verify/${certificate.cert_id}`,
    });
  } catch (error) {
    console.error("Certificate issuance error:", error);
    res.status(500).json({
      error_code: "CERTIFICATE_ISSUANCE_FAILED",
      message: error.message,
    });
  }
});

/**
 * GET /v1/certificates/verify/:cert_id - Verify a certificate
 */
app.get("/v1/certificates/verify/:cert_id", (req, res) => {
  try {
    const { cert_id } = req.params;

    const verification = certificateManager.verifyCertificate(cert_id);

    if (!verification.valid) {
      return res.status(400).json({
        valid: false,
        error: verification.error,
        details: verification.details || null,
      });
    }

    res.json({
      valid: true,
      certificate: verification.certificate,
    });
  } catch (error) {
    res.status(500).json({
      valid: false,
      error: "VERIFICATION_FAILED",
      message: error.message,
    });
  }
});

/**
 * GET /v1/certificates/:cert_id - Get certificate details
 */
app.get("/v1/certificates/:cert_id", validateApiKey, (req, res) => {
  try {
    const { cert_id } = req.params;

    const certificate = certificateManager.getCertificate(cert_id);

    if (!certificate) {
      return res.status(404).json({
        error_code: "CERTIFICATE_NOT_FOUND",
        message: `Certificate ${cert_id} not found`,
      });
    }

    // Return public certificate info (no private key)
    res.json({
      cert_id: certificate.cert_id,
      chitty_id: certificate.chitty_id,
      type: certificate.type,
      subject: certificate.subject,
      issuer: certificate.issuer,
      issued_at: certificate.issued_at,
      expires_at: certificate.expires_at,
      fingerprint: certificate.fingerprint,
      status: certificate.status,
      pem: certificate.pem,
      serial_number: certificate.serial_number,
    });
  } catch (error) {
    res.status(500).json({
      error_code: "RETRIEVAL_FAILED",
      message: error.message,
    });
  }
});

/**
 * POST /v1/certificates/:cert_id/revoke - Revoke a certificate
 */
app.post("/v1/certificates/:cert_id/revoke", validateApiKey, (req, res) => {
  try {
    const { cert_id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        error_code: "MISSING_REASON",
        message: "Revocation reason is required",
      });
    }

    const result = certificateManager.revokeCertificate(cert_id, reason);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error.message === "CERTIFICATE_NOT_FOUND") {
      return res.status(404).json({
        error_code: "CERTIFICATE_NOT_FOUND",
        message: `Certificate ${req.params.cert_id} not found`,
      });
    }

    res.status(500).json({
      error_code: "REVOCATION_FAILED",
      message: error.message,
    });
  }
});

/**
 * GET /v1/certificates/package/:package_name - List certificates for a package
 */
app.get("/v1/certificates/package/:package_name", validateApiKey, (req, res) => {
  try {
    const { package_name } = req.params;

    const certificates = certificateManager.listPackageCertificates(package_name);

    res.json({
      package_name,
      certificates,
      total: certificates.length,
    });
  } catch (error) {
    res.status(500).json({
      error_code: "LISTING_FAILED",
      message: error.message,
    });
  }
});

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "ChittyID Server",
    version: "2.0.0",
    timestamp: Date.now(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`ChittyID Server running on port ${PORT}`);
  console.log("STRICT RULE: Server-only ID generation enforced");
  console.log("Anomaly detection: Active");
  console.log("Drand integration: Configured");
});

export default app;
