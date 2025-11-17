/**
 * ChittyID Certificate Manager
 * Issues and manages certificates for packages, services, and entities
 */

import crypto from "crypto";

export class CertificateManager {
  constructor() {
    // In production, these would be securely managed private keys
    this.rootCA = {
      name: "ChittyFoundation Certificate Authority",
      privateKey: null, // Will be loaded from secure storage
      publicKey: null,
    };

    // Certificate registry (in production: database)
    this.certificates = new Map();
  }

  /**
   * Generate a self-signed root CA certificate (for development)
   */
  generateRootCA() {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });

    this.rootCA.privateKey = privateKey;
    this.rootCA.publicKey = publicKey;

    return { privateKey, publicKey };
  }

  /**
   * Issue a certificate for a package
   */
  issuePackageCertificate(params) {
    const {
      package_name,
      version,
      requester,
      governance_approval,
      chitty_id, // Pre-minted ChittyID for the package
    } = params;

    // Generate certificate ID
    const cert_id = this.generateCertificateId("PKG", package_name, version);

    // Generate key pair for the package
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });

    // Certificate metadata
    const now = new Date();
    const expires = new Date(now);
    expires.setFullYear(expires.getFullYear() + 1); // 1 year validity

    const certificate = {
      cert_id,
      chitty_id,
      type: "package",
      subject: {
        package_name,
        version,
        common_name: `${package_name}@${version}`,
      },
      issuer: {
        cn: "ChittyFoundation CA",
        o: "ChittyOS",
      },
      issued_at: now.toISOString(),
      expires_at: expires.toISOString(),
      public_key: publicKey,
      fingerprint: this.generateFingerprint(publicKey),
      status: "active",
      governance: {
        requester,
        approval: governance_approval,
      },
      serial_number: this.generateSerialNumber(),
    };

    // Sign the certificate with CA private key
    const signature = this.signCertificate(certificate);
    certificate.signature = signature;

    // Generate PEM format
    certificate.pem = this.generatePEM(certificate);

    // Store certificate
    this.certificates.set(cert_id, certificate);

    return {
      cert_id,
      chitty_id,
      fingerprint: certificate.fingerprint,
      issued_at: certificate.issued_at,
      expires_at: certificate.expires_at,
      pem: certificate.pem,
      public_key: publicKey,
      private_key: privateKey, // Only returned once during issuance
      serial_number: certificate.serial_number,
    };
  }

  /**
   * Generate certificate ID following ChittyOS naming
   */
  generateCertificateId(type, name, version) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    // Generate unique sequence number
    const sequence = String(this.certificates.size + 1).padStart(3, "0");

    return `CERT-${type}-${year}${month}${day}-${sequence}`;
  }

  /**
   * Generate fingerprint from public key
   */
  generateFingerprint(publicKey) {
    const hash = crypto.createHash("sha256");
    hash.update(publicKey);
    return "sha256:" + hash.digest("hex");
  }

  /**
   * Generate serial number
   */
  generateSerialNumber() {
    return crypto.randomBytes(16).toString("hex").toUpperCase();
  }

  /**
   * Sign certificate with CA private key
   */
  signCertificate(certificate) {
    if (!this.rootCA.privateKey) {
      this.generateRootCA(); // Development only
    }

    // Create signature data
    const signData = JSON.stringify({
      cert_id: certificate.cert_id,
      chitty_id: certificate.chitty_id,
      subject: certificate.subject,
      issued_at: certificate.issued_at,
      expires_at: certificate.expires_at,
      fingerprint: certificate.fingerprint,
    });

    const sign = crypto.createSign("SHA256");
    sign.update(signData);
    sign.end();

    return sign.sign(this.rootCA.privateKey, "base64");
  }

  /**
   * Generate PEM format certificate
   */
  generatePEM(certificate) {
    const certData = {
      version: 3,
      serialNumber: certificate.serial_number,
      issuer: certificate.issuer,
      subject: certificate.subject,
      validity: {
        notBefore: certificate.issued_at,
        notAfter: certificate.expires_at,
      },
      publicKey: certificate.public_key,
      extensions: {
        chittyId: certificate.chitty_id,
        certId: certificate.cert_id,
        type: certificate.type,
      },
      signature: certificate.signature,
    };

    const certJSON = JSON.stringify(certData, null, 2);
    const certBase64 = Buffer.from(certJSON).toString("base64");

    // Format as PEM
    const pemLines = certBase64.match(/.{1,64}/g) || [];
    return [
      "-----BEGIN CHITTYOS CERTIFICATE-----",
      ...pemLines,
      "-----END CHITTYOS CERTIFICATE-----",
    ].join("\n");
  }

  /**
   * Verify a certificate
   */
  verifyCertificate(cert_id) {
    const certificate = this.certificates.get(cert_id);

    if (!certificate) {
      return {
        valid: false,
        error: "CERTIFICATE_NOT_FOUND",
      };
    }

    // Check expiration
    const now = new Date();
    const expires = new Date(certificate.expires_at);

    if (now > expires) {
      return {
        valid: false,
        error: "CERTIFICATE_EXPIRED",
        expires_at: certificate.expires_at,
      };
    }

    // Check status
    if (certificate.status !== "active") {
      return {
        valid: false,
        error: "CERTIFICATE_REVOKED",
        status: certificate.status,
      };
    }

    // Verify signature
    try {
      const signData = JSON.stringify({
        cert_id: certificate.cert_id,
        chitty_id: certificate.chitty_id,
        subject: certificate.subject,
        issued_at: certificate.issued_at,
        expires_at: certificate.expires_at,
        fingerprint: certificate.fingerprint,
      });

      const verify = crypto.createVerify("SHA256");
      verify.update(signData);
      verify.end();

      const isValid = verify.verify(
        this.rootCA.publicKey,
        certificate.signature,
        "base64"
      );

      if (!isValid) {
        return {
          valid: false,
          error: "INVALID_SIGNATURE",
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: "SIGNATURE_VERIFICATION_FAILED",
        details: error.message,
      };
    }

    return {
      valid: true,
      certificate: {
        cert_id: certificate.cert_id,
        chitty_id: certificate.chitty_id,
        subject: certificate.subject,
        fingerprint: certificate.fingerprint,
        issued_at: certificate.issued_at,
        expires_at: certificate.expires_at,
        status: certificate.status,
      },
    };
  }

  /**
   * Revoke a certificate
   */
  revokeCertificate(cert_id, reason) {
    const certificate = this.certificates.get(cert_id);

    if (!certificate) {
      throw new Error("CERTIFICATE_NOT_FOUND");
    }

    certificate.status = "revoked";
    certificate.revoked_at = new Date().toISOString();
    certificate.revocation_reason = reason;

    this.certificates.set(cert_id, certificate);

    return {
      cert_id,
      status: "revoked",
      revoked_at: certificate.revoked_at,
      reason,
    };
  }

  /**
   * Get certificate by ID
   */
  getCertificate(cert_id) {
    return this.certificates.get(cert_id);
  }

  /**
   * List certificates by package
   */
  listPackageCertificates(package_name) {
    const certs = [];

    for (const [cert_id, cert] of this.certificates) {
      if (cert.type === "package" && cert.subject.package_name === package_name) {
        certs.push({
          cert_id,
          version: cert.subject.version,
          status: cert.status,
          issued_at: cert.issued_at,
          expires_at: cert.expires_at,
        });
      }
    }

    return certs;
  }
}

// Singleton instance
export const certificateManager = new CertificateManager();
