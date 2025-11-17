/**
 * ChittyOS Registry Service
 * Package and service registration management
 */

import type { Env } from "../router";

export async function registryHandler(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  const url = new URL(request.url);
  const subPath = pathname.replace("/registry", "");

  // POST /registry/api/packages/register - Register a package
  if (request.method === "POST" && subPath === "/api/packages/register") {
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
            message: "Authentication required to register packages",
          },
          { status: 401 },
        );
      }

      // Parse scopes and verify package registration permission
      const scopes = authenticatedScopes ? JSON.parse(authenticatedScopes) : [];
      const hasRegistryWrite = scopes.includes("registry:write") || scopes.includes("registry:admin");

      if (!hasRegistryWrite) {
        return Response.json(
          {
            error: "Forbidden",
            message: "Insufficient permissions. Required scope: registry:write",
            user_scopes: scopes,
          },
          { status: 403 },
        );
      }

      // Validate required fields
      const { package_name, version, cert_id, chronicle_event_id, status } = body;

      if (!package_name || !version || !cert_id) {
        return Response.json(
          {
            error: "MISSING_REQUIRED_FIELDS",
            message: "package_name, version, and cert_id are required",
          },
          { status: 400 },
        );
      }

      // Generate registration ID
      const reg_id = `reg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      const registration = {
        reg_id,
        package_name,
        version,
        cert_id,
        chronicle_event_id: chronicle_event_id || null,
        r2_location: body.r2_location || null,
        npm_registry: body.npm_registry || "https://registry.npmjs.org",
        status: status || "certified",
        registered_at: new Date().toISOString(),
        registered_by: authenticatedChittyId, // Track who registered
        metadata: {
          ...body.metadata,
          authenticated_chitty_id: authenticatedChittyId,
          authenticated_scopes: scopes,
        },
      };

      // Store in SERVICE_REGISTRY KV
      if (env.KV_NAMESPACE) {
        // Store registration record
        const regKey = `package:${package_name}:${version}`;
        await env.KV_NAMESPACE.put(
          regKey,
          JSON.stringify(registration),
        );

        // Index by package name for easy lookup
        const packageIndexKey = `package:${package_name}:versions`;
        const existingVersions = await env.KV_NAMESPACE.get(packageIndexKey);
        const versions = existingVersions ? JSON.parse(existingVersions) : [];

        versions.push({
          version,
          reg_id,
          cert_id,
          status,
          registered_at: registration.registered_at,
        });

        await env.KV_NAMESPACE.put(
          packageIndexKey,
          JSON.stringify(versions),
        );

        // Store in global package index
        const allPackagesKey = "registry:all_packages";
        const allPackagesData = await env.KV_NAMESPACE.get(allPackagesKey);
        const allPackages = allPackagesData ? JSON.parse(allPackagesData) : [];

        if (!allPackages.find((p: any) => p.package_name === package_name)) {
          allPackages.push({
            package_name,
            latest_version: version,
            registered_at: registration.registered_at,
          });

          await env.KV_NAMESPACE.put(
            allPackagesKey,
            JSON.stringify(allPackages),
          );
        }
      }

      return Response.json({
        success: true,
        reg_id,
        package_name,
        version,
        registry_url: `https://registry.chitty.cc/packages/${package_name}/${version}`,
        registered_at: registration.registered_at,
      }, { status: 201 });
    } catch (error) {
      return Response.json(
        {
          error: "REGISTRATION_FAILED",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  }

  // GET /registry/packages/:package/:version - Get package registration
  const packageVersionMatch = subPath.match(/^\/packages\/([^/]+)\/([^/]+)$/);
  if (request.method === "GET" && packageVersionMatch) {
    const packageName = decodeURIComponent(packageVersionMatch[1]);
    const version = decodeURIComponent(packageVersionMatch[2]);

    if (env.KV_NAMESPACE) {
      const regKey = `package:${packageName}:${version}`;
      const regData = await env.KV_NAMESPACE.get(regKey);

      if (!regData) {
        return Response.json(
          { error: "Package not found" },
          { status: 404 },
        );
      }

      return Response.json(JSON.parse(regData));
    }

    return Response.json(
      { error: "Registry not configured" },
      { status: 503 },
    );
  }

  // GET /registry/packages/:package - List all versions of a package
  const packageMatch = subPath.match(/^\/packages\/([^/]+)$/);
  if (request.method === "GET" && packageMatch) {
    const packageName = decodeURIComponent(packageMatch[1]);

    if (env.KV_NAMESPACE) {
      const packageIndexKey = `package:${packageName}:versions`;
      const versionsData = await env.KV_NAMESPACE.get(packageIndexKey);

      if (!versionsData) {
        return Response.json(
          { error: "Package not found" },
          { status: 404 },
        );
      }

      const versions = JSON.parse(versionsData);

      return Response.json({
        package_name: packageName,
        versions,
        total: versions.length,
      });
    }

    return Response.json(
      { error: "Registry not configured" },
      { status: 503 },
    );
  }

  // GET /registry/packages - List all packages
  if (request.method === "GET" && subPath === "/packages") {
    if (env.KV_NAMESPACE) {
      const allPackagesKey = "registry:all_packages";
      const allPackagesData = await env.KV_NAMESPACE.get(allPackagesKey);
      const allPackages = allPackagesData ? JSON.parse(allPackagesData) : [];

      return Response.json({
        packages: allPackages,
        total: allPackages.length,
      });
    }

    return Response.json(
      { error: "Registry not configured" },
      { status: 503 },
    );
  }

  // PUT /registry/packages/:package/:version/status - Update package status
  const statusMatch = subPath.match(/^\/packages\/([^/]+)\/([^/]+)\/status$/);
  if (request.method === "PUT" && statusMatch) {
    try {
      const packageName = decodeURIComponent(statusMatch[1]);
      const version = decodeURIComponent(statusMatch[2]);
      const body = await request.json();

      // Extract authenticated actor from request headers
      const authenticatedChittyId = request.headers.get("X-Authenticated-ChittyID");
      const authenticatedScopes = request.headers.get("X-Authenticated-Scopes");

      // Verify authentication
      if (!authenticatedChittyId) {
        return Response.json(
          {
            error: "Unauthorized",
            message: "Authentication required to update package status",
          },
          { status: 401 },
        );
      }

      // Parse scopes and verify permission
      const scopes = authenticatedScopes ? JSON.parse(authenticatedScopes) : [];
      const hasRegistryAdmin = scopes.includes("registry:admin") || scopes.includes("registry:write");

      if (!hasRegistryAdmin) {
        return Response.json(
          {
            error: "Forbidden",
            message: "Insufficient permissions. Required scope: registry:admin or registry:write",
            user_scopes: scopes,
          },
          { status: 403 },
        );
      }

      if (!body.status) {
        return Response.json(
          { error: "Status is required" },
          { status: 400 },
        );
      }

      if (env.KV_NAMESPACE) {
        const regKey = `package:${packageName}:${version}`;
        const regData = await env.KV_NAMESPACE.get(regKey);

        if (!regData) {
          return Response.json(
            { error: "Package not found" },
            { status: 404 },
          );
        }

        const registration = JSON.parse(regData);
        registration.status = body.status;
        registration.status_updated_at = new Date().toISOString();
        registration.status_reason = body.reason || null;

        await env.KV_NAMESPACE.put(regKey, JSON.stringify(registration));

        return Response.json({
          success: true,
          package_name: packageName,
          version,
          status: body.status,
          updated_at: registration.status_updated_at,
        });
      }

      return Response.json(
        { error: "Registry not configured" },
        { status: 503 },
      );
    } catch (error) {
      return Response.json(
        {
          error: "STATUS_UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  }

  // Default response for Registry service
  return Response.json({
    service: "ChittyOS Registry",
    message: "Package and service registration management",
    status: "operational",
    endpoints: [
      "POST /registry/api/packages/register - Register a package",
      "GET /registry/packages - List all packages",
      "GET /registry/packages/{package} - List package versions",
      "GET /registry/packages/{package}/{version} - Get package details",
      "PUT /registry/packages/{package}/{version}/status - Update package status",
    ],
  });
}
