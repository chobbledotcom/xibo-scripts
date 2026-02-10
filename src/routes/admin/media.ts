/**
 * Admin media library routes
 *
 * Handles browsing, uploading, viewing, and deleting media files
 * through the Xibo CMS API.
 */

import {
  del,
  get,
  getRaw,
  loadXiboConfig,
  postMultipart,
} from "#xibo/client.ts";
import type { XiboConfig, XiboFolder, XiboMedia } from "#xibo/types.ts";
import { defineRoutes, type RouteParams } from "#routes/router.ts";
import {
  getAuthenticatedSession,
  htmlResponse,
  redirect,
  redirectWithSuccess,
  requireSessionOr,
  validateCsrfToken,
  withAuthForm,
} from "#routes/utils.ts";
import {
  mediaDetailPage,
  mediaListPage,
  mediaUploadPage,
} from "#templates/admin/media.tsx";

/**
 * Load Xibo config or redirect to settings if not configured.
 */
const withXiboConfig = async (
  handler: (config: XiboConfig) => Promise<Response>,
): Promise<Response> => {
  const config = await loadXiboConfig();
  if (!config) {
    return redirect("/admin/settings?error=Xibo+API+not+configured");
  }
  return handler(config);
};

/**
 * Fetch the folder list from Xibo. Returns empty array on error.
 */
const fetchFolders = async (config: XiboConfig): Promise<XiboFolder[]> => {
  try {
    return await get<XiboFolder[]>(config, "folders");
  } catch {
    return [];
  }
};

/**
 * Fetch all media from Xibo.
 */
const fetchMedia = (config: XiboConfig): Promise<XiboMedia[]> =>
  get<XiboMedia[]>(config, "library");

/**
 * Extract error message from an unknown thrown value.
 */
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error";
}

/**
 * GET /admin/media — list all media with optional filters
 */
const handleMediaListGet = (request: Request): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const url = new URL(request.url);
      const folderParam = url.searchParams.get("folderId");
      const folderId = folderParam ? Number(folderParam) : undefined;
      const mediaType = url.searchParams.get("type") || undefined;
      const success = url.searchParams.get("success") || undefined;
      const error = url.searchParams.get("error") || undefined;

      let media: XiboMedia[];
      let folders: XiboFolder[];
      try {
        [media, folders] = await Promise.all([
          fetchMedia(config),
          fetchFolders(config),
        ]);
      } catch (e) {
        return htmlResponse(
          mediaListPage(
            session,
            [],
            [],
            undefined,
            undefined,
            undefined,
            `Failed to load media: ${errorMessage(e)}`,
          ),
        );
      }

      return htmlResponse(
        mediaListPage(
          session,
          media,
          folders,
          folderId,
          mediaType,
          success,
          error,
        ),
      );
    }),
  );

/**
 * GET /admin/media/upload — upload form
 */
const handleMediaUploadGet = (request: Request): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const folders = await fetchFolders(config);
      return htmlResponse(mediaUploadPage(session, folders));
    }),
  );

/**
 * POST /admin/media/upload — multipart file upload.
 *
 * Parses multipart form data directly (rather than using withAuthForm which
 * reads the body as url-encoded) and validates the CSRF token manually.
 */
const handleMediaUploadPost = async (
  request: Request,
): Promise<Response> => {
  const session = await getAuthenticatedSession(request);
  if (!session) return redirect("/admin");

  const config = await loadXiboConfig();
  if (!config) {
    return redirect("/admin/settings?error=Xibo+API+not+configured");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    const folders = await fetchFolders(config);
    return htmlResponse(
      mediaUploadPage(session, folders, "Invalid form data"),
      400,
    );
  }

  const csrfToken = formData.get("csrf_token");
  if (
    !csrfToken ||
    typeof csrfToken !== "string" ||
    !validateCsrfToken(session.csrfToken, csrfToken)
  ) {
    return htmlResponse("Invalid CSRF token", 403);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    const folders = await fetchFolders(config);
    return htmlResponse(
      mediaUploadPage(session, folders, "Please select a file to upload"),
      400,
    );
  }

  const name = (formData.get("name") as string) || file.name;
  const folderId = (formData.get("folderId") as string) || "";

  const uploadData = new FormData();
  uploadData.append("files", file, file.name);
  uploadData.append("name", name);
  if (folderId) {
    uploadData.append("folderId", folderId);
  }

  try {
    await postMultipart<XiboMedia>(config, "library", uploadData);
    return redirectWithSuccess("/admin/media", `Uploaded "${name}"`);
  } catch (e) {
    const folders = await fetchFolders(config);
    return htmlResponse(
      mediaUploadPage(
        session,
        folders,
        `Upload failed: ${errorMessage(e)}`,
      ),
    );
  }
};

/**
 * POST /admin/media/upload-url — upload media from a URL
 */
const handleMediaUploadUrl = (request: Request): Promise<Response> =>
  withAuthForm(request, (session, form) =>
    withXiboConfig(async (config) => {
      const url = (form.get("url") || "").trim();
      const name = (form.get("name") || "").trim();
      const folderId = (form.get("folderId") || "").trim();

      if (!url) {
        const folders = await fetchFolders(config);
        return htmlResponse(
          mediaUploadPage(session, folders, "URL is required"),
          400,
        );
      }

      if (!name) {
        const folders = await fetchFolders(config);
        return htmlResponse(
          mediaUploadPage(session, folders, "Name is required"),
          400,
        );
      }

      // Download the file from the URL
      let fileResponse: globalThis.Response;
      try {
        fileResponse = await fetch(url);
      } catch (e) {
        const folders = await fetchFolders(config);
        return htmlResponse(
          mediaUploadPage(
            session,
            folders,
            `Failed to download: ${errorMessage(e)}`,
          ),
        );
      }

      if (!fileResponse.ok) {
        const folders = await fetchFolders(config);
        return htmlResponse(
          mediaUploadPage(
            session,
            folders,
            `Download failed: HTTP ${fileResponse.status}`,
          ),
        );
      }

      const blob = await fileResponse.blob();
      const contentType = fileResponse.headers.get("content-type") || "";
      const extension = url.split("/").pop()?.split("?")[0] || "file";
      const filename = `${name}.${extension.split(".").pop() || "bin"}`;

      const uploadData = new FormData();
      uploadData.append(
        "files",
        new File([blob], filename, { type: contentType }),
        filename,
      );
      uploadData.append("name", name);
      if (folderId) {
        uploadData.append("folderId", folderId);
      }

      try {
        await postMultipart<XiboMedia>(config, "library", uploadData);
        return redirectWithSuccess(
          "/admin/media",
          `Uploaded "${name}" from URL`,
        );
      } catch (e) {
        const folders = await fetchFolders(config);
        return htmlResponse(
          mediaUploadPage(
            session,
            folders,
            `Upload failed: ${errorMessage(e)}`,
          ),
        );
      }
    }),
  );

/**
 * GET /admin/media/:id — view media details
 */
const handleMediaDetailGet = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const mediaId = Number(params.id);
      const allMedia = await fetchMedia(config);
      const media = allMedia.find((m) => m.mediaId === mediaId);

      if (!media) {
        return htmlResponse("<h1>Media Not Found</h1>", 404);
      }

      return htmlResponse(mediaDetailPage(session, media));
    }),
  );

/**
 * GET /admin/media/:id/preview — proxy image preview from Xibo CMS
 */
const handleMediaPreviewGet = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  requireSessionOr(request, () =>
    withXiboConfig(async (config) => {
      const mediaId = params.id;

      try {
        const response = await getRaw(
          config,
          `library/download/${mediaId}`,
        );
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
    }),
  );

/**
 * POST /admin/media/:id/delete — delete media
 */
const handleMediaDeletePost = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  withAuthForm(request, (_session, _form) =>
    withXiboConfig(async (config) => {
      const mediaId = params.id;

      try {
        await del(config, `library/${mediaId}`);
        return redirectWithSuccess("/admin/media", "Media deleted");
      } catch (e) {
        return redirect(
          `/admin/media?error=${encodeURIComponent(`Delete failed: ${errorMessage(e)}`)}`,
        );
      }
    }),
  );

/** Media routes */
export const mediaRoutes = defineRoutes({
  "GET /admin/media": (request) => handleMediaListGet(request),
  "GET /admin/media/upload": (request) => handleMediaUploadGet(request),
  "POST /admin/media/upload": (request) => handleMediaUploadPost(request),
  "POST /admin/media/upload-url": (request) => handleMediaUploadUrl(request),
  "GET /admin/media/:id": (request, params) =>
    handleMediaDetailGet(request, params),
  "GET /admin/media/:id/preview": (request, params) =>
    handleMediaPreviewGet(request, params),
  "POST /admin/media/:id/delete": (request, params) =>
    handleMediaDeletePost(request, params),
});
