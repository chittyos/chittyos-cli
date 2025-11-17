/**
 * ChittyOS Get - Service Onboarding & Provisioning
 * Endpoint: get.chitty.cc
 *
 * Automates service registration in the ChittyOS ecosystem:
 * - Provisions ChittyID for new services
 * - Generates authentication credentials
 * - Configures ChittyConnect integration
 * - Registers service with ecosystem
 */

export interface Env {
  CHITTYID_URL?: string;
  CHITTYAUTH_URL?: string;
  CHITTYREGISTER_URL?: string;
  CHITTY_SERVICE_TOKEN: string;
  CHITTY_SERVICE_ID: string;
  KV_NAMESPACE?: KVNamespace;
}

interface OnboardRequest {
  service_name: string;
  service_type: "cloudflare_worker" | "api_service" | "mcp_server" | "frontend_app";
  description?: string;
  endpoints?: string[];
  required_scopes?: string[];
  dependencies?: string[];
  metadata?: Record<string, any>;
}

interface OnboardResponse {
  success: boolean;
  chitty_id: string;
  service_token: string;
  configuration: {
    env_vars: Record<string, string>;
    wrangler_snippet: string;
    next_steps: string[];
  };
  registration: {
    registered_at: string;
    registry_url: string;
    chronicle_event_id: string;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Root - service info
      if (url.pathname === "/" || url.pathname === "") {
        return Response.json({
          service: "ChittyOS Get",
          description: "Automated service onboarding and provisioning",
          version: "1.0.0",
          endpoints: {
            "POST /onboard": "Onboard a new service to ChittyOS ecosystem",
            "GET /health": "Health check",
            "GET /docs": "API documentation",
          },
          example: {
            method: "POST",
            url: "https://get.chitty.cc/onboard",
            body: {
              service_name: "my-service",
              service_type: "cloudflare_worker",
              description: "My awesome service",
              required_scopes: ["chronicle:write", "registry:read"],
            },
          },
        }, {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Health check
      if (url.pathname === "/health") {
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // POST /onboard - Main onboarding endpoint
      if (request.method === "POST" && url.pathname === "/onboard") {
        return await handleOnboard(request, env, corsHeaders);
      }

      // 404
      return Response.json(
        { error: "Not found", available_endpoints: ["/onboard", "/health"] },
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    } catch (error) {
      console.error("ChittyOS Get error:", error);
      return Response.json(
        {
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
  },
};

/**
 * Handle service onboarding
 */
async function handleOnboard(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const body = await request.json() as OnboardRequest;

    // Validate required fields
    if (!body.service_name || !body.service_type) {
      return Response.json(
        {
          error: "Missing required fields",
          required: ["service_name", "service_type"],
        },
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Sanitize service name (no spaces, lowercase)
    const serviceName = body.service_name.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    // Step 1: Mint ChittyID for the service
    const chittyId = await mintServiceChittyId(serviceName, body, env);
    if (!chittyId) {
      return Response.json(
        { error: "Failed to provision ChittyID" },
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Step 2: Generate service token from ChittyAuth
    const serviceToken = await generateServiceToken(chittyId, body.required_scopes || [], env);
    if (!serviceToken) {
      return Response.json(
        { error: "Failed to generate service token" },
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Step 3: Register service with ChittyRegistry
    const registration = await registerService(chittyId, body, env);

    // Step 4: Log to Chronicle
    const chronicleEventId = await logToChronicle({
      event_type: "service.onboarded",
      service_name: serviceName,
      chitty_id: chittyId,
      service_type: body.service_type,
    }, env);

    // Step 5: Generate configuration
    const configuration = generateConfiguration(serviceName, chittyId, serviceToken, body);

    const response: OnboardResponse = {
      success: true,
      chitty_id: chittyId,
      service_token: serviceToken,
      configuration,
      registration: {
        registered_at: new Date().toISOString(),
        registry_url: registration?.registry_url || `https://registry.chitty.cc/services/${serviceName}`,
        chronicle_event_id: chronicleEventId || "pending",
      },
    };

    return Response.json(response, {
      status: 201,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("Onboarding error:", error);
    return Response.json(
      {
        error: "Onboarding failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
}

/**
 * Mint ChittyID for service
 */
async function mintServiceChittyId(
  serviceName: string,
  body: OnboardRequest,
  env: Env,
): Promise<string | null> {
  const chittyIdUrl = env.CHITTYID_URL || "https://id.chitty.cc";

  try {
    const response = await fetch(`${chittyIdUrl}/api/v1/mint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.CHITTY_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        namespace: "SRV",
        metadata: {
          service_name: serviceName,
          service_type: body.service_type,
          description: body.description,
          onboarded_at: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      console.error(`ChittyID mint failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.chitty_id || data.identifier;
  } catch (error) {
    console.error("ChittyID mint error:", error);
    return null;
  }
}

/**
 * Generate service token from ChittyAuth
 */
async function generateServiceToken(
  chittyId: string,
  scopes: string[],
  env: Env,
): Promise<string | null> {
  const authUrl = env.CHITTYAUTH_URL || "https://chittyauth-mcp-121.chittycorp-llc.workers.dev";

  try {
    const response = await fetch(`${authUrl}/v1/service/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.CHITTY_SERVICE_TOKEN}`,
        "X-ChittyID": chittyId,
      },
      body: JSON.stringify({
        service_id: chittyId,
        scopes: ["auth:validate", "auth:check", ...scopes],
        expires_in: "365d",
      }),
    });

    if (!response.ok) {
      console.error(`ChittyAuth token generation failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.token || data.service_token;
  } catch (error) {
    console.error("Service token generation error:", error);
    return null;
  }
}

/**
 * Register service with ChittyRegistry
 */
async function registerService(
  chittyId: string,
  body: OnboardRequest,
  env: Env,
): Promise<any> {
  const registerUrl = env.CHITTYREGISTER_URL || "https://register.chitty.cc";

  try {
    const response = await fetch(`${registerUrl}/api/v1/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.CHITTY_SERVICE_TOKEN}`,
        "X-ChittyID": env.CHITTY_SERVICE_ID,
      },
      body: JSON.stringify({
        name: body.service_name,
        chitty_id: chittyId,
        service_type: body.service_type,
        description: body.description,
        endpoints: body.endpoints || [],
        dependencies: body.dependencies || [],
        metadata: body.metadata || {},
      }),
    });

    if (!response.ok) {
      console.warn(`Service registration failed: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Service registration error:", error);
    return null;
  }
}

/**
 * Log event to Chronicle
 */
async function logToChronicle(
  event: Record<string, any>,
  env: Env,
): Promise<string | null> {
  try {
    const response = await fetch("https://api.chitty.cc/chronicle/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.CHITTY_SERVICE_TOKEN}`,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      console.warn(`Chronicle logging failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.event_id;
  } catch (error) {
    console.error("Chronicle logging error:", error);
    return null;
  }
}

/**
 * Generate configuration for the new service
 */
function generateConfiguration(
  serviceName: string,
  chittyId: string,
  serviceToken: string,
  body: OnboardRequest,
): OnboardResponse["configuration"] {
  const envVars: Record<string, string> = {
    CHITTY_SERVICE_ID: chittyId,
    CHITTY_SERVICE_TOKEN: serviceToken,
    CHITTYAUTH_URL: "https://chittyauth-mcp-121.chittycorp-llc.workers.dev",
    CHITTYID_URL: "https://id.chitty.cc",
  };

  const wranglerSnippet = `# Add to your wrangler.toml
[vars]
CHITTY_SERVICE_ID = "${chittyId}"
CHITTYAUTH_URL = "https://chittyauth-mcp-121.chittycorp-llc.workers.dev"

# Set this as a secret:
# wrangler secret put CHITTY_SERVICE_TOKEN
# Then paste: ${serviceToken}`;

  const nextSteps = [
    "1. Add CHITTY_SERVICE_ID to your wrangler.toml [vars] section",
    "2. Run: wrangler secret put CHITTY_SERVICE_TOKEN",
    "3. Integrate ChittyAuth middleware (see chittyos-api-gateway/src/middleware/auth.ts)",
    "4. Test authentication with your service token",
    "5. Deploy your service with: wrangler deploy",
    `6. Verify at: https://registry.chitty.cc/services/${serviceName}`,
  ];

  return { env_vars: envVars, wrangler_snippet: wranglerSnippet, next_steps: nextSteps };
}
