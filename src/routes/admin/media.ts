/**
 * Admin media library routes
 *
 * Handles browsing, uploading, viewing, and deleting media files
 * through the Xibo CMS API.
 */

import {
  get,
  getRaw,
  loadXiboConfig,
  postMultipart,
} from "#xibo/client.ts";
import type { XiboConfig, XiboFolder, XiboMedia } from "#xibo/types.ts";
import { defineRoutes } from "#routes/router.ts";
import {
  getAuthenticatedSession,
  htmlResponse,
  redirect,
  redirectWithSuccess,
  validateCsrfToken,
} from "#routes/utils.ts";
import {
  mediaDetailPage,
  mediaListPage,
  mediaUploadPage,
} from "#templates/admin/media.tsx";
import {
  deleteRoute,
  detailRoute,
  errorMessage,
  sessionRoute,
} from "#routes/admin/utils.ts";

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
 * Render upload page with an error, fetching folders for the form.
 */
const uploadError = async (
  session: { csrfToken: string; adminLevel: string },
  config: XiboConfig,
  message: string,
  status = 200,
): Promise<Response> => {
  const folders = await fetchFolders(config);
  return htmlResponse(mediaUploadPage(session, folders, message), status);
};

/**
 * Build upload FormData, send to Xibo, and handle success/error.
 */
const performUpload = async (
  session: { csrfToken: string; adminLevel: string },
  config: XiboConfig,
  file: File,
  name: string,
  folderId: string,
  successSuffix = "",
): Promise<Response> => {
  const uploadData = new FormData();
  uploadData.append("files", file, file.name);
  uploadData.append("name", name);
  if (folderId) uploadData.append("folderId", folderId);
  try {
    await postMultipart<XiboMedia>(config, "library", uploadData);
    return redirectWithSuccess(
      "/admin/media",
      `Uploaded "${name}"${successSuffix}`,
    );
  } catch (e) {
    return uploadError(
      session,
      config,
      `Upload failed: ${errorMessage(e)}`,
    );
  }
};

/**
 * GET /admin/media — list all media with optional filters
 */
const handleMediaListGet = sessionRoute(async (session, config, request) => {
  const params = new URL(request.url).searchParams;
  const folderParam = params.get("folderId");
  const folderId = folderParam ? Number(folderParam) : undefined;
  const mediaType = params.get("type") || undefined;
  const success = params.get("success") || undefined;
  const error = params.get("error") || undefined;

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
});

/**
 * GET /admin/media/upload — upload form
 */
const handleMediaUploadGet = sessionRoute(
  async (session, config) => {
    const folders = await fetchFolders(config);
    return htmlResponse(mediaUploadPage(session, folders));
  },
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
    return uploadError(session, config, "Invalid form data", 400);
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
    return uploadError(
      session,
      config,
      "Please select a file to upload",
      400,
    );
  }

  const name = (formData.get("name") as string) || file.name;
  const folderId = (formData.get("folderId") as string) || "";
  return performUpload(session, config, file, name, folderId);
};

/**
 * POST /admin/media/upload-url — upload media from a URL
 */
const handleMediaUploadUrl = sessionRoute(
  async (session, config, request) => {
    const form = await request.clone().text().then(
      (body) => new URLSearchParams(body),
    );
    const url = (form.get("url") || "").trim();
    const name = (form.get("name") || "").trim();
    const folderId = (form.get("folderId") || "").trim();

    if (!url) return uploadError(session, config, "URL is required", 400);
    if (!name) {
      return uploadError(session, config, "Name is required", 400);
    }

    // Download the file from the URL
    let fileResponse: globalThis.Response;
    try {
      fileResponse = await fetch(url);
    } catch (e) {
      return uploadError(
        session,
        config,
        `Failed to download: ${errorMessage(e)}`,
      );
    }

    if (!fileResponse.ok) {
      return uploadError(
        session,
        config,
        `Download failed: HTTP ${fileResponse.status}`,
      );
    }

    const blob = await fileResponse.blob();
    const contentType = fileResponse.headers.get("content-type") || "";
    const extension = url.split("/").pop()?.split("?")[0] || "file";
    const filename = `${name}.${extension.split(".").pop() || "bin"}`;
    const fileObj = new File([blob], filename, { type: contentType });

    return performUpload(
      session,
      config,
      fileObj,
      name,
      folderId,
      " from URL",
    );
  },
);

/**
 * GET /admin/media/:id — view media details
 */
const handleMediaDetailGet = detailRoute(
  async (session, config, params) => {
    const mediaId = Number(params.id);
    const allMedia = await fetchMedia(config);
    const media = allMedia.find((m) => m.mediaId === mediaId);

    if (!media) {
      return htmlResponse("<h1>Media Not Found</h1>", 404);
    }

    return htmlResponse(mediaDetailPage(session, media));
  },
);

/**
 * GET /admin/media/:id/preview — proxy image preview from Xibo CMS
 */
const handleMediaPreviewGet = detailRoute(
  async (_session, config, params) => {
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
  },
);

/**
 * POST /admin/media/:id/delete — delete media
 */
const handleMediaDeletePost = deleteRoute(
  (p) => `library/${p.id}`,
  "/admin/media",
  "Media deleted",
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
