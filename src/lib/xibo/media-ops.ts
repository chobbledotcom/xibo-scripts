/**
 * Shared media operations used by both admin and user routes.
 *
 * Provides reusable functions for fetching, uploading, previewing,
 * and deleting media through the Xibo API.
 */

import { del, get, getRaw, loadXiboConfig, postMultipart } from "#xibo/client.ts";
import type { XiboConfig, XiboFolder, XiboMedia } from "#xibo/types.ts";
import {
  type AuthSession,
  getAuthenticatedSession,
  htmlResponse,
  redirect,
  redirectWithError,
  redirectWithSuccess,
} from "#routes/utils.ts";
import { errorMessage } from "#routes/admin/utils.ts";

/**
 * Fetch the folder list from Xibo. Returns empty array on error.
 */
export const fetchFolders = async (
  config: XiboConfig,
): Promise<XiboFolder[]> => {
  try {
    return await get<XiboFolder[]>(config, "folders");
  } catch {
    return [];
  }
};

/**
 * Fetch all media from Xibo.
 */
export const fetchAllMedia = (config: XiboConfig): Promise<XiboMedia[]> =>
  get<XiboMedia[]>(config, "library");

/**
 * Find a specific media item by ID. Returns undefined if not found.
 */
export const findMediaById = async (
  config: XiboConfig,
  mediaId: number,
): Promise<XiboMedia | undefined> => {
  const allMedia = await fetchAllMedia(config);
  return allMedia.find((m) => m.mediaId === mediaId);
};

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
  const uploadData = new FormData();
  uploadData.append("files", file, file.name);
  uploadData.append("name", name);
  if (folderId) uploadData.append("folderId", folderId);
  try {
    await postMultipart<XiboMedia>(config, "library", uploadData);
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
    const response = await getRaw(config, `library/download/${mediaId}`);
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
): Promise<
  | { ok: true; formData: FormData }
  | { ok: false; response: Response }
> => {
  const { validateCsrfToken } = await import("#routes/utils.ts");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return { ok: false, response: htmlResponse("Invalid form data", 400) };
  }

  const csrfToken = formData.get("csrf_token");
  if (
    !csrfToken ||
    typeof csrfToken !== "string" ||
    !validateCsrfToken(sessionCsrfToken, csrfToken)
  ) {
    return {
      ok: false,
      response: htmlResponse("Invalid CSRF token", 403),
    };
  }

  return { ok: true, formData };
};

/**
 * Extract file from validated FormData. Returns null if no valid file.
 */
export const extractFile = (
  formData: FormData,
): File | null => {
  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0) return null;
  return file;
};

/**
 * Extract the upload name from form data, falling back to the file name.
 */
export const extractUploadName = (formData: FormData, file: File): string =>
  (formData.get("name") as string) || file.name;

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

  const file = extractFile(parsed.formData);
  if (!file) return onNoFile(result);

  return onFile(result, file, parsed.formData);
};

/**
 * Verify media belongs to a specific folder, then delete it.
 * Returns redirect with success/error message.
 */
export const verifyAndDeleteMedia = async (
  config: XiboConfig,
  mediaId: number,
  expectedFolderId: number,
  successUrl: string,
  successMsg: string,
  errorUrl: string,
  notFoundMsg: string,
  wrongFolderMsg: string,
): Promise<Response> => {
  try {
    const media = await findMediaById(config, mediaId);
    if (!media) return redirectWithError(errorUrl, notFoundMsg);
    if (media.folderId !== expectedFolderId) {
      return redirectWithError(errorUrl, wrongFolderMsg);
    }
  } catch (e) {
    return redirectWithError(errorUrl, `Failed to verify media: ${errorMessage(e)}`);
  }

  try {
    await del(config, `library/${mediaId}`);
    return redirectWithSuccess(successUrl, successMsg);
  } catch (e) {
    return redirectWithError(errorUrl, `Delete failed: ${errorMessage(e)}`);
  }
};
