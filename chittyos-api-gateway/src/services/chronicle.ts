/**
 * ChittyOS Chronicle Service
 * Event sourcing and audit trail management
 */

import chronicleSpec from "../../openapi-specs/chronicle.json";
import type { Env } from "../router";

export async function chronicleHandler(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  const url = new URL(request.url);
  const subPath = pathname.replace("/chronicle", "");

  // Serve OpenAPI spec
  if (request.method === "GET" && subPath === "/openapi.json") {
    return new Response(JSON.stringify(chronicleSpec, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Handle events listing
  if (request.method === "GET" && subPath === "/events") {
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const type = url.searchParams.get("type");

    // TODO: Implement actual event retrieval from KV/D1
    return Response.json({
      events: [
        {
          id: "evt_sample_001",
          type: type || "system.startup",
          timestamp: new Date().toISOString(),
          actor: "system",
          payload: {
            message: "Chronicle service initialized",
          },
          metadata: {
            service: "chronicle",
            version: "1.0.0",
          },
        },
      ],
      total: 1,
      offset,
      limit,
    });
  }

  // Handle event creation
  if (request.method === "POST" && subPath === "/events") {
    try {
      const body = await request.json();

      // Extract authenticated actor from request headers
      const authenticatedChittyId = request.headers.get("X-Authenticated-ChittyID");
      const authenticatedScopes = request.headers.get("X-Authenticated-Scopes");

      // Verify authentication (should have been checked by middleware)
      if (!authenticatedChittyId) {
        return Response.json(
          {
            error: "Unauthorized",
            message: "Authentication required to create events",
          },
          { status: 401 },
        );
      }

      // Generate event ID with date-based prefix
      const date = new Date();
      const dateStr = date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const sequence = Math.random().toString(36).substr(2, 6);
      const eventId = `evt_${dateStr}_${sequence}`;

      // Package-specific event validation
      if (body.event_type && body.event_type.startsWith("package.")) {
        if (!body.package || !body.version) {
          return Response.json(
            {
              error: "Invalid package event",
              message: "Package events require 'package' and 'version' fields",
            },
            { status: 400 },
          );
        }

        // Add package-specific metadata
        body.metadata = {
          ...body.metadata,
          package: body.package,
          version: body.version,
          event_category: "package_lifecycle",
        };
      }

      const event = {
        id: eventId,
        type: body.event_type || body.type,
        timestamp: new Date().toISOString(),
        actor: authenticatedChittyId, // Use authenticated identity
        actor_provided: body.actor, // Preserve client-provided actor for audit
        payload: body,
        metadata: {
          ...body.metadata,
          authenticated_chitty_id: authenticatedChittyId,
          authenticated_scopes: authenticatedScopes ? JSON.parse(authenticatedScopes) : [],
        },
        chronicle_url: `https://api.chitty.cc/chronicle/events/${eventId}`,
      };

      // Store event in KV namespace
      if (env.KV_NAMESPACE) {
        await env.KV_NAMESPACE.put(
          `event:${eventId}`,
          JSON.stringify(event),
          {
            expirationTtl: 86400 * 365, // 1 year
          },
        );

        // Index by package for easy lookup
        if (body.package) {
          const packageKey = `package:${body.package}:events`;
          const existingEvents = await env.KV_NAMESPACE.get(packageKey);
          const events = existingEvents ? JSON.parse(existingEvents) : [];
          events.push({
            event_id: eventId,
            event_type: event.type,
            version: body.version,
            timestamp: event.timestamp,
          });

          await env.KV_NAMESPACE.put(
            packageKey,
            JSON.stringify(events),
            {
              expirationTtl: 86400 * 365, // 1 year
            },
          );
        }
      }

      return Response.json({
        success: true,
        event_id: eventId,
        chronicle_url: event.chronicle_url,
        timestamp: event.timestamp,
      }, { status: 201 });
    } catch (error) {
      return Response.json(
        {
          error: "Invalid request body",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 400 },
      );
    }
  }

  // Handle package event history
  const packageMatch = subPath.match(/^\/packages\/(.+)\/events$/);
  if (request.method === "GET" && packageMatch) {
    const packageName = decodeURIComponent(packageMatch[1]);

    if (env.KV_NAMESPACE) {
      const packageKey = `package:${packageName}:events`;
      const eventsData = await env.KV_NAMESPACE.get(packageKey);

      if (!eventsData) {
        return Response.json({
          package: packageName,
          events: [],
          total: 0,
        });
      }

      const events = JSON.parse(eventsData);

      return Response.json({
        package: packageName,
        events,
        total: events.length,
      });
    }

    return Response.json({
      package: packageName,
      events: [],
      total: 0,
      message: "KV storage not configured",
    });
  }

  // Handle individual event retrieval
  const eventMatch = subPath.match(/^\/events\/(.+)$/);
  if (request.method === "GET" && eventMatch) {
    const eventId = eventMatch[1];

    // Retrieve from KV
    const eventData = env.KV_NAMESPACE
      ? await env.KV_NAMESPACE.get(`event:${eventId}`)
      : null;

    if (!eventData) {
      return Response.json(
        { error: "Event not found" },
        { status: 404 },
      );
    }

    return Response.json(JSON.parse(eventData));
  }

  // Default response for Chronicle service
  return Response.json({
    service: "ChittyOS Chronicle",
    message: "Event sourcing and audit trail management",
    status: "operational",
    endpoints: [
      "GET /chronicle/openapi.json - OpenAPI specification",
      "GET /chronicle/events - List events",
      "POST /chronicle/events - Create event",
      "GET /chronicle/events/{id} - Get event by ID",
      "GET /chronicle/packages/{package}/events - Get package event history",
    ],
    package_event_types: [
      "package.build.start",
      "package.build.complete",
      "package.build.failed",
      "package.test.complete",
      "package.certificate.issued",
      "package.published",
      "package.deprecated",
      "package.unpublished",
    ],
  });
}
