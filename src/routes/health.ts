/**
 * Health check endpoint
 */

/**
 * Simple health check - returns 200 OK
 */
export const handleHealthCheck = (): Response =>
  new Response("OK", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
