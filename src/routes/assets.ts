/**
 * Static asset handlers - serve CSS, JS, and favicon
 */

import { dirname, fromFileUrl, join } from "@std/path";

const currentDir = dirname(fromFileUrl(import.meta.url));
const staticDir = join(currentDir, "..", "static");

// Read static files at module load time
// These get inlined by esbuild during edge build
const mvpCss = Deno.readTextFileSync(join(staticDir, "mvp.css"));
const adminJs = Deno.readTextFileSync(join(staticDir, "admin.js"));
const faviconSvg = Deno.readTextFileSync(join(staticDir, "favicon.svg"));

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
