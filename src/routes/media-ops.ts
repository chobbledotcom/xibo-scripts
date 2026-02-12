/**
 * Shared media route operations used by both admin and user routes.
 *
 * HTTP-aware handlers for uploading, previewing, and deleting media.
 * Delegates to pure Xibo operations in lib/xibo/media-ops.ts.
 */

import { ok, err, type Result } from "#fp";
import { loadXiboConfig } from "#xibo/client.ts";
import { errorMessage } from "#lib/logger.ts";
import {
  deleteMedia,
  extractFile,
  fetchMediaRaw,
  findMediaById,
  uploadMedia,
} from "#xibo/media-ops.ts";
import type { XiboConfig } from "#xibo/types.ts";
import {
  type AuthSession,
  getAuthenticatedSession,
  htmlResponse,
  redirect,
  redirectWithError,
  redirectWithSuccess,
  validateCsrfToken,
} from "#routes/utils.ts";

/**
 * Build upload FormData and send to Xibo.
 * Returns a redirect on success or calls onError on failure.
 */
export const uploadToXibo = async (
  config: XiboConfig,
  file: File,
  name: string,
  folderId: string,
  successUrl: string,
  onError: (message: string) => Response | Promise<Response>,
): Promise<Response> => {
  try {
    await uploadMedia(config, file, name, folderId);
    return redirectWithSuccess(successUrl, `Uploaded "${name}"`);
  } catch (e) {
    return onError(`Upload failed: ${errorMessage(e)}`);
  }
};

/**
 * Proxy an image preview from the Xibo API.
 * Returns the binary response with appropriate content type and caching.
 */
export const proxyMediaPreview = async (
  config: XiboConfig,
  mediaId: string,
): Promise<Response> => {
  try {
    const response = await fetchMediaRaw(config, mediaId);
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const body = await response.arrayBuffer();

    return new Response(body, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    return htmlResponse("Failed to load preview", 500);
  }
};


/**
 * Validate CSRF token from multipart form data.
 * Returns the form data and file if valid, or null if CSRF check fails.
 */
export const parseMultipartWithCsrf = async (
  request: Request,
  sessionCsrfToken: string,
): Promise<Result<FormData>> => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return err(htmlResponse("Invalid form data", 400));
  }

  const csrfToken = formData.get("csrf_token");
  if (
    !csrfToken ||
    typeof csrfToken !== "string" ||
    !validateCsrfToken(sessionCsrfToken, csrfToken)
  ) {
    return err(htmlResponse("Invalid CSRF token", 403));
  }

  return ok(formData);
};

/** Authenticated session + config for upload handlers */
export type UploadContext = {
  session: { csrfToken: string };
  config: XiboConfig;
};

/**
 * Resolve authenticated session + Xibo config for upload handlers.
 * Returns { session, config } or a redirect Response on failure.
 */
export const resolveAuthConfig = async (
  request: Request,
): Promise<{ session: AuthSession; config: XiboConfig } | Response> => {
  const session = await getAuthenticatedSession(request);
  if (!session) return redirect("/admin");
  const config = await loadXiboConfig();
  if (!config) return redirect("/admin/settings?error=Xibo+API+not+configured");
  return { session, config };
};

/**
 * High-level multipart upload handler. Resolves auth + config, parses
 * multipart form with CSRF, extracts file, and delegates to caller.
 * Generic over context type so callers can extend with extra fields.
 */
export const handleMultipartUpload = async <C extends UploadContext>(
  request: Request,
  resolveContext: (request: Request) => Promise<C | Response>,
  onFormError: (ctx: C, msg: string) => Response | Promise<Response>,
  onNoFile: (ctx: C) => Response | Promise<Response>,
  onFile: (ctx: C, file: File, formData: FormData) => Promise<Response>,
): Promise<Response> => {
  const result = await resolveContext(request);
  if (result instanceof Response) return result;

  const parsed = await parseMultipartWithCsrf(request, result.session.csrfToken);
  if (!parsed.ok) {
    // 400 = invalid form data (delegate to caller), 403 = CSRF error (return as-is)
    return parsed.response.status === 400
      ? onFormError(result, "Invalid form data")
      : parsed.response;
  }

  const file = extractFile(parsed.value);
  if (!file) return onNoFile(result);

  return onFile(result, file, parsed.value);
};

/** Options for verifyAndDeleteMedia */
export type VerifyDeleteOptions = {
  config: XiboConfig;
  mediaId: number;
  expectedFolderId: number;
  successUrl: string;
  successMsg: string;
  errorUrl: string;
  notFoundMsg: string;
  wrongFolderMsg: string;
};

/**
 * Verify media belongs to a specific folder, then delete it.
 * Returns redirect with success/error message.
 */
export const verifyAndDeleteMedia = async (
  opts: VerifyDeleteOptions,
): Promise<Response> => {
  try {
    const media = await findMediaById(opts.config, opts.mediaId);
    if (!media) return redirectWithError(opts.errorUrl, opts.notFoundMsg);
    if (media.folderId !== opts.expectedFolderId) {
      return redirectWithError(opts.errorUrl, opts.wrongFolderMsg);
    }
  } catch (e) {
    return redirectWithError(opts.errorUrl, `Failed to verify media: ${errorMessage(e)}`);
  }

  try {
    await deleteMedia(opts.config, opts.mediaId);
    return redirectWithSuccess(opts.successUrl, opts.successMsg);
  } catch (e) {
    return redirectWithError(opts.errorUrl, `Delete failed: ${errorMessage(e)}`);
  }
};
