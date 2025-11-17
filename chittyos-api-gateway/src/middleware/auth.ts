/**
 * ChittyAuth Authentication Middleware
 * Provides zero-trust authentication for API Gateway endpoints
 */

import type { Env } from "../router";

export interface AuthContext {
  authenticated: boolean;
  chittyId?: string;
  scopes?: string[];
  tokenType?: "bearer" | "service" | "apikey";
  actorEmail?: string;
  error?: string;
}

/**
 * ChittyAuth Service Client
 * Communicates with ChittyAuth service for token validation
 */
export class ChittyAuthClient {
  private baseUrl: string;
  private serviceToken?: string;

  constructor(baseUrl: string, serviceToken?: string) {
    this.baseUrl = baseUrl;
    this.serviceToken = serviceToken;
  }

  /**
   * Validate JWT bearer token with ChittyAuth service
   */
  async validateJWT(token: string): Promise<AuthContext> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/jwt/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        return {
          authenticated: false,
          error: `ChittyAuth validation failed: ${response.status}`,
        };
      }

      const data = await response.json();

      return {
        authenticated: data.valid === true,
        chittyId: data.chitty_id,
        scopes: data.scopes || [],
        tokenType: "bearer",
        actorEmail: data.email,
      };
    } catch (error) {
      console.error("ChittyAuth JWT validation error:", error);
      return {
        authenticated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Validate API key with ChittyAuth service
   */
  async validateApiKey(apiKey: string): Promise<AuthContext> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/api/keys/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ api_key: apiKey }),
      });

      if (!response.ok) {
        return {
          authenticated: false,
          error: `API key validation failed: ${response.status}`,
        };
      }

      const data = await response.json();

      return {
        authenticated: data.valid === true,
        chittyId: data.chitty_id,
        scopes: data.scopes || [],
        tokenType: "apikey",
      };
    } catch (error) {
      console.error("ChittyAuth API key validation error:", error);
      return {
        authenticated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Validate service token (for service-to-service authentication)
   */
  async validateServiceToken(token: string): Promise<AuthContext> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/service/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ service_token: token }),
      });

      if (!response.ok) {
        return {
          authenticated: false,
          error: `Service token validation failed: ${response.status}`,
        };
      }

      const data = await response.json();

      return {
        authenticated: data.valid === true,
        chittyId: data.service_id,
        scopes: data.scopes || [],
        tokenType: "service",
      };
    } catch (error) {
      console.error("ChittyAuth service token validation error:", error);
      return {
        authenticated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check permission for authenticated user
   */
  async checkPermission(
    chittyId: string,
    permission: string,
    resource?: string,
  ): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/permissions/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ChittyID": chittyId,
        },
        body: JSON.stringify({ permission, resource }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.allowed === true;
    } catch (error) {
      console.error("ChittyAuth permission check error:", error);
      return false;
    }
  }
}

/**
 * Extract authentication token from request
 */
export function extractToken(request: Request): {
  token: string | null;
  type: "bearer" | "service" | "apikey" | null;
} {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return { token: null, type: null };
  }

  // Bearer token (JWT)
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    // Determine if it's a JWT or service token based on format
    if (token.includes(".")) {
      return { token, type: "bearer" };
    } else if (token.startsWith("svc_")) {
      return { token, type: "service" };
    } else {
      return { token, type: "apikey" };
    }
  }

  // API Key
  if (authHeader.startsWith("ApiKey ")) {
    return { token: authHeader.substring(7), type: "apikey" };
  }

  return { token: null, type: null };
}

/**
 * Authentication Middleware
 * Validates requests against ChittyAuth service
 */
export async function authenticateRequest(
  request: Request,
  env: Env,
): Promise<AuthContext> {
  const { token, type } = extractToken(request);

  if (!token || !type) {
    return {
      authenticated: false,
      error: "Missing authentication token",
    };
  }

  // Initialize ChittyAuth client
  const chittyAuthUrl =
    env.CHITTYAUTH_URL || "https://chittyauth-mcp-121.chittycorp-llc.workers.dev";
  const authClient = new ChittyAuthClient(chittyAuthUrl, env.CHITTY_SERVICE_TOKEN);

  // Validate based on token type
  switch (type) {
    case "bearer":
      return await authClient.validateJWT(token);
    case "service":
      return await authClient.validateServiceToken(token);
    case "apikey":
      return await authClient.validateApiKey(token);
    default:
      return {
        authenticated: false,
        error: "Unknown token type",
      };
  }
}

/**
 * Require authentication middleware
 * Returns 401 if authentication fails
 */
export async function requireAuth(
  request: Request,
  env: Env,
): Promise<{ response?: Response; authContext?: AuthContext }> {
  const authContext = await authenticateRequest(request, env);

  if (!authContext.authenticated) {
    return {
      response: new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: authContext.error || "Authentication required",
          hint: "Provide a valid Bearer token, API key, or service token",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": 'Bearer realm="ChittyOS API Gateway"',
          },
        },
      ),
    };
  }

  return { authContext };
}

/**
 * Require specific scopes middleware
 */
export async function requireScopes(
  request: Request,
  env: Env,
  requiredScopes: string[],
): Promise<{ response?: Response; authContext?: AuthContext }> {
  const { response, authContext } = await requireAuth(request, env);

  if (response) {
    return { response };
  }

  if (!authContext) {
    return {
      response: new Response(
        JSON.stringify({ error: "Authentication context missing" }),
        { status: 500 },
      ),
    };
  }

  // Check if user has required scopes
  const userScopes = authContext.scopes || [];
  const hasAllScopes = requiredScopes.every((scope) =>
    userScopes.includes(scope),
  );

  if (!hasAllScopes) {
    return {
      response: new Response(
        JSON.stringify({
          error: "Forbidden",
          message: "Insufficient permissions",
          required_scopes: requiredScopes,
          user_scopes: userScopes,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      ),
    };
  }

  return { authContext };
}

/**
 * Optional authentication middleware
 * Allows request to proceed even if authentication fails
 */
export async function optionalAuth(
  request: Request,
  env: Env,
): Promise<AuthContext> {
  const authContext = await authenticateRequest(request, env);
  return authContext;
}
