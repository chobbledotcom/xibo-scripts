/**
 * Static asset handlers - serve CSS, JS, and favicon
 */

import mvpCss from "#static/mvp.css" with { type: "text" };
import adminJs from "#static/admin.js" with { type: "text" };
import faviconSvg from "#static/favicon.svg" with { type: "text" };

/** Cache headers for static assets (1 year for cache-busted paths) */
const CACHE_HEADERS = {
  "cache-control": "public, max-age=31536000, immutable",
};

/**
 * Serve MVP.css
 */
export const handleMvpCss = (): Response =>
  new Response(mvpCss, {
    headers: {
      "content-type": "text/css; charset=utf-8",
      ...CACHE_HEADERS,
    },
  });

/**
 * Serve admin JavaScript
 */
export const handleAdminJs = (): Response =>
  new Response(adminJs, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      ...CACHE_HEADERS,
    },
  });

/**
 * Serve favicon
 */
export const handleFavicon = (): Response =>
  new Response(faviconSvg, {
    headers: {
      "content-type": "image/svg+xml",
      ...CACHE_HEADERS,
    },
  });
