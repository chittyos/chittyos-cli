/**
 * ChittyConnect Credential Management Service
 * Integrates with 1Password for secure credential provisioning
 * Implements zero-trust secret management for ChittyOS ecosystem
 */

import type { Env } from "../router";

export interface Credential {
  name: string;
  value: string;
  type: "api_key" | "token" | "password" | "certificate" | "connection_string";
  service: string;
  scope?: string[];
  expiresAt?: string;
  rotationSchedule?: string;
  metadata?: Record<string, any>;
}

export interface CredentialRequest {
  service: string;
  credentialName: string;
  chittyId?: string;
  scope?: string[];
}

/**
 * ChittyConnect Client
 * Manages credential retrieval and rotation via 1Password integration
 */
export class ChittyConnectClient {
  private onePasswordVault: string;
  private env: Env;

  constructor(env: Env, vaultName: string = "ChittyOS-Secrets") {
    this.env = env;
    this.onePasswordVault = vaultName;
  }

  /**
   * Retrieve credential from 1Password vault
   * Pattern: op://ChittyOS-Secrets/CHITTY_{SERVICE}_TOKEN/password
   */
  async getCredential(request: CredentialRequest): Promise<Credential | null> {
    const { service, credentialName, scope } = request;

    // First, try environment variable (for Wrangler secrets)
    const envVarName = this.buildEnvVarName(service, credentialName);
    const envValue = this.env[envVarName as keyof Env];

    if (envValue && typeof envValue === "string") {
      return {
        name: credentialName,
        value: envValue,
        type: this.inferCredentialType(credentialName),
        service,
        scope,
      };
    }

    // If not in env, check KV namespace for cached credentials
    if (this.env.KV_NAMESPACE) {
      const kvKey = `credential:${service}:${credentialName}`;
      const cached = await this.env.KV_NAMESPACE.get(kvKey);

      if (cached) {
        const credential = JSON.parse(cached);

        // Check if credential has expired
        if (credential.expiresAt) {
          const expiryDate = new Date(credential.expiresAt);
          if (expiryDate < new Date()) {
            console.warn(`Credential ${credentialName} for ${service} has expired`);
            await this.env.KV_NAMESPACE.delete(kvKey);
            return null;
          }
        }

        return credential;
      }
    }

    console.warn(
      `Credential ${credentialName} for service ${service} not found in environment or cache`,
    );
    return null;
  }

  /**
   * Store credential in KV cache
   * Used for credentials retrieved from 1Password CLI
   */
  async cacheCredential(credential: Credential, ttl: number = 3600): Promise<void> {
    if (!this.env.KV_NAMESPACE) {
      console.warn("KV_NAMESPACE not configured, cannot cache credential");
      return;
    }

    const kvKey = `credential:${credential.service}:${credential.name}`;
    await this.env.KV_NAMESPACE.put(
      kvKey,
      JSON.stringify(credential),
      { expirationTtl: ttl },
    );
  }

  /**
   * Build environment variable name following ChittyOS naming convention
   * Pattern: CHITTY_{SERVICE}_{CREDENTIAL_TYPE}
   */
  private buildEnvVarName(service: string, credentialName: string): string {
    const serviceName = service.toUpperCase().replace(/-/g, "_");
    const credName = credentialName.toUpperCase().replace(/-/g, "_");

    // If credential name already starts with CHITTY_, return as-is
    if (credName.startsWith("CHITTY_")) {
      return credName;
    }

    return `CHITTY_${serviceName}_${credName}`;
  }

  /**
   * Infer credential type from name
   */
  private inferCredentialType(
    name: string,
  ): "api_key" | "token" | "password" | "certificate" | "connection_string" {
    const lowerName = name.toLowerCase();

    if (lowerName.includes("api_key") || lowerName.includes("apikey")) {
      return "api_key";
    }
    if (lowerName.includes("token")) {
      return "token";
    }
    if (lowerName.includes("cert") || lowerName.includes("certificate")) {
      return "certificate";
    }
    if (
      lowerName.includes("connection") ||
      lowerName.includes("url") ||
      lowerName.includes("dsn")
    ) {
      return "connection_string";
    }

    return "password";
  }

  /**
   * Get multiple credentials at once
   */
  async getCredentials(
    requests: CredentialRequest[],
  ): Promise<Map<string, Credential>> {
    const credentials = new Map<string, Credential>();

    for (const request of requests) {
      const credential = await this.getCredential(request);
      if (credential) {
        const key = `${request.service}:${request.credentialName}`;
        credentials.set(key, credential);
      }
    }

    return credentials;
  }

  /**
   * Rotate credential (mark for rotation in next sync)
   */
  async rotateCredential(service: string, credentialName: string): Promise<void> {
    if (!this.env.KV_NAMESPACE) {
      console.warn("KV_NAMESPACE not configured, cannot mark for rotation");
      return;
    }

    const rotationKey = `rotation:${service}:${credentialName}`;
    await this.env.KV_NAMESPACE.put(
      rotationKey,
      JSON.stringify({
        service,
        credentialName,
        requestedAt: new Date().toISOString(),
        status: "pending",
      }),
      { expirationTtl: 86400 }, // 24 hours
    );

    console.log(`Marked credential ${credentialName} for rotation`);
  }

  /**
   * List pending credential rotations
   */
  async listPendingRotations(): Promise<Array<{ service: string; credential: string }>> {
    if (!this.env.KV_NAMESPACE) {
      return [];
    }

    const rotations: Array<{ service: string; credential: string }> = [];
    const list = await this.env.KV_NAMESPACE.list({ prefix: "rotation:" });

    for (const key of list.keys) {
      const parts = key.name.split(":");
      if (parts.length >= 3) {
        rotations.push({
          service: parts[1],
          credential: parts[2],
        });
      }
    }

    return rotations;
  }
}

/**
 * Credential Service Registry
 * Maps services to their required credentials
 */
export const SERVICE_CREDENTIALS = {
  notion: {
    credentials: [
      { name: "NOTION_TOKEN", required: true, scope: ["read", "write"] },
    ],
    baseUrl: "https://api.notion.com",
  },
  stripe: {
    credentials: [
      { name: "STRIPE_SECRET_KEY", required: true, scope: ["payment:read", "payment:write"] },
      { name: "STRIPE_WEBHOOK_SECRET", required: false },
    ],
    baseUrl: "https://api.stripe.com",
  },
  docusign: {
    credentials: [
      { name: "DOCUSIGN_ACCESS_TOKEN", required: true, scope: ["signature:read", "signature:write"] },
      { name: "DOCUSIGN_INTEGRATION_KEY", required: true },
    ],
    baseUrl: "https://api.docusign.com",
  },
  blockchain: {
    credentials: [
      { name: "BLOCKCHAIN_RPC_URL", required: true },
      { name: "CHITTY_CONTRACT_ADDRESS", required: true },
      { name: "BLOCKCHAIN_PRIVATE_KEY", required: false, scope: ["blockchain:write"] },
    ],
  },
  chittyauth: {
    credentials: [
      { name: "SERVICE_TOKEN", required: true, scope: ["auth:validate", "auth:check"] },
    ],
    baseUrl: "https://chittyauth-mcp-121.chittycorp-llc.workers.dev",
  },
  chittyid: {
    credentials: [
      { name: "SERVICE_TOKEN", required: true, scope: ["id:generate", "id:verify"] },
    ],
    baseUrl: "https://id.chitty.cc",
  },
} as const;

/**
 * Get credentials for a specific service
 */
export async function getServiceCredentials(
  env: Env,
  service: keyof typeof SERVICE_CREDENTIALS,
): Promise<Map<string, Credential>> {
  const connectClient = new ChittyConnectClient(env);
  const serviceConfig = SERVICE_CREDENTIALS[service];

  if (!serviceConfig) {
    console.warn(`Unknown service: ${service}`);
    return new Map();
  }

  const requests: CredentialRequest[] = serviceConfig.credentials.map(
    (cred) => ({
      service,
      credentialName: cred.name,
      scope: cred.scope,
    }),
  );

  return await connectClient.getCredentials(requests);
}

/**
 * Validate all required credentials are present
 */
export async function validateServiceCredentials(
  env: Env,
  service: keyof typeof SERVICE_CREDENTIALS,
): Promise<{ valid: boolean; missing: string[] }> {
  const credentials = await getServiceCredentials(env, service);
  const serviceConfig = SERVICE_CREDENTIALS[service];

  const missing: string[] = [];

  for (const credConfig of serviceConfig.credentials) {
    if (credConfig.required) {
      const key = `${service}:${credConfig.name}`;
      if (!credentials.has(key)) {
        missing.push(credConfig.name);
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
