/**
 * Middleware functions for request processing
 */

import { compact } from "#fp";
import { getAllowedDomain } from "#lib/config.ts";

/**
 * Security headers for all responses
 */
const BASE_SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-robots-tag": "noindex, nofollow",
};

/**
 * Build CSP header value
 */
const buildCspHeader = (): string =>
  compact([
    "frame-ancestors 'none'",
    "default-src 'self'",
    "style-src 'self'",
    "script-src 'self'",
    "form-action 'self'",
  ]).join("; ");

/**
 * Get security headers for a response
 */
export const getSecurityHeaders = (): Record<string, string> => ({
  ...BASE_SECURITY_HEADERS,
  "x-frame-options": "DENY",
  "content-security-policy": buildCspHeader(),
});

/**
 * Extract hostname from Host header (removes port if present)
 */
const getHostname = (host: string): string => {
  const colonIndex = host.indexOf(":");
  return colonIndex === -1 ? host : host.slice(0, colonIndex);
};

/**
 * Validate request domain against ALLOWED_DOMAIN.
 * Checks the Host header to prevent the app being served through unauthorized proxies.
 * Returns true if the request should be allowed.
 */
export const isValidDomain = (request: Request): boolean => {
  const host = request.headers.get("host");
  if (!host) {
    return false;
  }
  return getHostname(host) === getAllowedDomain();
};

/**
 * Validate Content-Type for POST requests.
 * Returns true if the request is valid (not a POST, or has correct Content-Type).
 * POST endpoints use form-urlencoded or multipart/form-data (file uploads).
 */
export const isValidContentType = (request: Request): boolean => {
  if (request.method !== "POST") {
    return true;
  }
  const contentType = request.headers.get("content-type") || "";
  return (
    contentType.startsWith("application/x-www-form-urlencoded") ||
    contentType.startsWith("multipart/form-data")
  );
};

/**
 * Create Content-Type rejection response
 */
export const contentTypeRejectionResponse = (): Response =>
  new Response("Bad Request: Invalid Content-Type", {
    status: 400,
    headers: {
      "content-type": "text/plain",
      ...getSecurityHeaders(),
    },
  });

/**
 * Create domain rejection response
 */
export const domainRejectionResponse = (): Response =>
  new Response("Forbidden: Invalid domain", {
    status: 403,
    headers: {
      "content-type": "text/plain",
      ...getSecurityHeaders(),
    },
  });

/**
 * Apply security headers to a response
 */
export const applySecurityHeaders = (
  response: Response,
): Response => {
  const headers = new Headers(response.headers);
  const securityHeaders = getSecurityHeaders();

  for (const [key, value] of Object.entries(securityHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
