/**
 * ChittyOS API Gateway - Service Router
 * Central routing for Chronicle, Quality, and Registry services
 */

import { chronicleHandler } from "./services/chronicle";
import { qualityHandler } from "./services/quality";
import { registryHandler } from "./services/registry";
import { requireAuth, optionalAuth, type AuthContext } from "./middleware/auth";

export interface Env {
  KV_NAMESPACE?: KVNamespace;
  D1_DATABASE?: D1Database;
  R2_BUCKET?: R2Bucket;
  QUEUE?: Queue;
  DURABLE_OBJECT?: DurableObjectNamespace;

  // ChittyAuth Integration
  CHITTYAUTH_URL?: string;
  CHITTY_SERVICE_TOKEN?: string;

  // ChittyConnect Managed Credentials (via 1Password)
  CHITTY_API_KEY?: string;
  CHITTY_NOTION_TOKEN?: string;
  CHITTY_STRIPE_SECRET_KEY?: string;
  CHITTY_DOCUSIGN_ACCESS_TOKEN?: string;
  CHITTY_BLOCKCHAIN_RPC_URL?: string;
  CHITTY_CONTRACT_ADDRESS?: string;

  // Legacy support (deprecated)
  NOTION_TOKEN?: string;
  STRIPE_SECRET_KEY?: string;
  DOCUSIGN_ACCESS_TOKEN?: string;
  BLOCKCHAIN_RPC_URL?: string;
}

export const serviceRoutes = {
  // Event sourcing and quality services
  "/chronicle": chronicleHandler,
  "/quality": qualityHandler,
  "/registry": registryHandler,

  // Health and monitoring
  "/health": async () => new Response("OK", { status: 200 }),
  "/api/v1/status": async (req: Request, env: Env) => {
    return Response.json({
      service: "chittyos-api-gateway",
      chitty_id: env.CHITTY_SERVICE_ID || "not-configured",
      status: "operational",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      authentication: {
        enabled: true,
        provider: "ChittyAuth",
        url: env.CHITTYAUTH_URL || "https://chittyauth-mcp-121.chittycorp-llc.workers.dev",
      },
      dependencies: {
        chronicle: "operational",
        quality: "operational",
        registry: "operational",
        chittyauth: "integrated",
        chittyconnect: "integrated",
      },
      endpoints: [
        "/health",
        "/api/v1/status",
        "/chronicle/*",
        "/quality/*",
        "/registry/*",
      ],
    });
  },
};

/**
 * Determine if request requires authentication
 * Zero-trust approach: All write operations require auth
 * Public read operations are allowed for transparency
 */
function shouldRequireAuth(method: string, pathname: string): boolean {
  // All write operations require authentication
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return true;
  }

  // Health and status endpoints are public
  if (pathname === "/health" || pathname === "/api/v1/status") {
    return false;
  }

  // OpenAPI specs are public
  if (pathname.includes("/openapi.json")) {
    return false;
  }

  // GET requests to chronicle events are public (transparency)
  if (method === "GET" && pathname.startsWith("/chronicle/events")) {
    return false;
  }

  // GET requests to registry are public (package discovery)
  if (method === "GET" && pathname.startsWith("/registry/packages")) {
    return false;
  }

  // Default to requiring auth for unknown endpoints
  return true;
}

// Main worker entry point
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers with origin whitelist (zero-trust approach)
    const allowedOrigins = [
      "https://chitty.cc",
      "https://www.chitty.cc",
      "https://api.chitty.cc",
      "https://id.chitty.cc",
      "https://registry.chitty.cc",
      "https://mcp.chitty.cc",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:8080",
    ];

    const origin = request.headers.get("Origin") || "";
    const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-ChittyID, X-Request-ID",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    };

    // Handle preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Root path - return ChittySync stub
      if (url.pathname === "/" || url.pathname === "") {
        return new Response(
          JSON.stringify({
            service: "ChittySync",
            message: "ChittySync is currently in development",
            status: "stub",
          }),
          {
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders,
            },
          },
        );
      }

      // Extract service path
      const pathPrefix = "/" + url.pathname.split("/")[1];

      // Route to appropriate handler
      const handler = serviceRoutes[pathPrefix];
      if (handler) {
        // Authentication check for protected endpoints
        let authContext: AuthContext | undefined;

        // Determine if endpoint requires authentication
        const requiresAuth = shouldRequireAuth(request.method, url.pathname);

        if (requiresAuth) {
          const authResult = await requireAuth(request, env);

          if (authResult.response) {
            // Authentication failed, return error response with CORS
            Object.entries(corsHeaders).forEach(([key, value]) => {
              authResult.response!.headers.set(key, value);
            });
            return authResult.response;
          }

          authContext = authResult.authContext;
        } else {
          // Optional auth for GET requests (provides context but doesn't block)
          authContext = await optionalAuth(request, env);
        }

        // Add auth context to request for downstream handlers
        const requestWithAuth = new Request(request, {
          headers: new Headers(request.headers),
        });

        if (authContext?.chittyId) {
          requestWithAuth.headers.set("X-Authenticated-ChittyID", authContext.chittyId);
          requestWithAuth.headers.set(
            "X-Authenticated-Scopes",
            JSON.stringify(authContext.scopes || []),
          );
        }

        const response = await handler(requestWithAuth, env, url.pathname);

        // Add CORS headers to response
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });

        // Add authentication info to response headers (for debugging)
        if (authContext?.authenticated) {
          response.headers.set("X-ChittyOS-Authenticated", "true");
          response.headers.set("X-ChittyOS-Actor", authContext.chittyId || "unknown");
        }

        return response;
      }

      // 404 for unknown routes
      return new Response(
        JSON.stringify({
          error: "Service not found",
          available: Object.keys(serviceRoutes),
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        },
      );
    } catch (error) {
      // Global error handler
      console.error("Worker error:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        },
      );
    }
  },

  // Scheduled worker for maintenance tasks
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    switch (event.cron) {
      case "0 */6 * * *": // Every 6 hours
        await performHealthCheck(env);
        break;
      case "0 0 * * *": // Daily at midnight
        await performDailyCleanup(env);
        break;
    }
  },

  // Queue consumer for async tasks
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
    for (const message of batch.messages) {
      try {
        await processQueueMessage(message, env);
        message.ack();
      } catch (error) {
        console.error("Queue processing error:", error);
        message.retry();
      }
    }
  },
};

// Helper functions
async function performHealthCheck(env: Env) {
  const results = [];
  for (const [path, handler] of Object.entries(serviceRoutes)) {
    if (typeof handler === "function") {
      try {
        const testRequest = new Request(`https://chittyos.com${path}/health`);
        const response = await handler(testRequest, env, `${path}/health`);
        results.push({
          service: path,
          status: response.status === 200 ? "healthy" : "unhealthy",
          statusCode: response.status,
        });
      } catch (error) {
        results.push({
          service: path,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  // Store health check results
  await env.KV_NAMESPACE.put(
    "health:latest",
    JSON.stringify({
      timestamp: new Date().toISOString(),
      results,
    }),
    { expirationTtl: 86400 }, // 24 hours
  );
}

async function performDailyCleanup(env: Env) {
  // Clean up old KV entries
  const keysToDelete = [];
  const list = await env.KV_NAMESPACE.list({ prefix: "temp:" });

  for (const key of list.keys) {
    const metadata = key.metadata as any;
    if (metadata?.expiresAt && new Date(metadata.expiresAt) < new Date()) {
      keysToDelete.push(key.name);
    }
  }

  // Batch delete expired keys
  for (const key of keysToDelete) {
    await env.KV_NAMESPACE.delete(key);
  }

  console.log(`Cleanup completed: ${keysToDelete.length} keys deleted`);
}

async function processQueueMessage(message: Message<any>, env: Env) {
  const { type, payload } = message.body;

  switch (type) {
    case "LEGAL_WORKFLOW":
      await processLegalWorkflow(payload, env);
      break;
    case "FINANCIAL_TRANSACTION":
      await processFinancialTransaction(payload, env);
      break;
    case "DOCUMENT_PROCESSING":
      await processDocument(payload, env);
      break;
    default:
      console.warn(`Unknown message type: ${type}`);
  }
}

async function processLegalWorkflow(payload: any, env: Env) {
  // Orchestrate legal workflow across services
  const caseId = await createCase(payload, env);
  await anchorToBlockchain(caseId, env);
  await notifyStakeholders(caseId, payload, env);
}

async function processFinancialTransaction(payload: any, env: Env) {
  // Process financial transaction with compliance checks
  await validateTransaction(payload, env);
  await recordInLedger(payload, env);
  await updateBalances(payload, env);
}

async function processDocument(payload: any, env: Env) {
  // Process document with OCR and analysis
  await extractMetadata(payload, env);
  await analyzeContent(payload, env);
  await storeInR2(payload, env);
}

// Stub implementations for async processing
async function createCase(payload: any, env: Env): Promise<string> {
  const caseId = `CASE-${Date.now()}`;
  await env.KV_NAMESPACE.put(`case:${caseId}`, JSON.stringify(payload));
  return caseId;
}

async function anchorToBlockchain(caseId: string, env: Env) {
  // Blockchain anchoring logic
  console.log(`Anchoring case ${caseId} to blockchain`);
}

async function notifyStakeholders(caseId: string, payload: any, env: Env) {
  // Notification logic
  console.log(`Notifying stakeholders for case ${caseId}`);
}

async function validateTransaction(payload: any, env: Env) {
  // Transaction validation
  console.log("Validating transaction");
}

async function recordInLedger(payload: any, env: Env) {
  // Ledger recording
  console.log("Recording in ledger");
}

async function updateBalances(payload: any, env: Env) {
  // Balance updates
  console.log("Updating balances");
}

async function extractMetadata(payload: any, env: Env) {
  // Metadata extraction
  console.log("Extracting metadata");
}

async function analyzeContent(payload: any, env: Env) {
  // Content analysis
  console.log("Analyzing content");
}

async function storeInR2(payload: any, env: Env) {
  // R2 storage
  console.log("Storing in R2");
}
