/**
 * Admin media library routes
 *
 * Handles browsing, uploading, viewing, and deleting media files
 * through the Xibo CMS API.
 */

import { filter } from "#fp";
import { getSharedFolderId } from "#lib/db/settings.ts";
import type { AdminLevel } from "#lib/types.ts";
import type { XiboConfig, XiboMedia } from "#xibo/types.ts";
import {
  extractUploadName,
  fetchAllMedia,
  fetchFolders,
  findMediaById,
  handleMultipartUpload,
  proxyMediaPreview,
  resolveAuthConfig,
  uploadToXibo,
  verifyAndDeleteMedia,
} from "#xibo/media-ops.ts";
import { defineRoutes } from "#routes/router.ts";
import { htmlResponse, redirectWithError } from "#routes/utils.ts";
import {
  mediaDetailPage,
  mediaListPage,
  mediaUploadPage,
  sharedMediaListPage,
  sharedMediaUploadPage,
} from "#templates/admin/media.tsx";
import {
  deleteRoute,
  detailRoute,
  errorMessage,
  getQueryMessages,
  sessionRoute,
  withXiboForm,
} from "#routes/admin/utils.ts";

/**
 * Render upload page with an error, fetching folders for the form.
 */
const uploadError = async (
  session: { csrfToken: string; adminLevel: AdminLevel },
  config: XiboConfig,
  message: string,
  status = 200,
): Promise<Response> => {
  const folders = await fetchFolders(config);
  return htmlResponse(mediaUploadPage(session, folders, message), status);
};

/**
 * GET /admin/media — list all media with optional filters
 */
const handleMediaListGet = sessionRoute(async (session, config, request) => {
  const params = new URL(request.url).searchParams;
  const folderParam = params.get("folderId");
  const folderId = folderParam ? Number(folderParam) : undefined;
  const mediaType = params.get("type") || undefined;
  const { success, error } = getQueryMessages(request);

  try {
    const [media, folders] = await Promise.all([
      fetchAllMedia(config),
      fetchFolders(config),
    ]);
    return htmlResponse(
      mediaListPage(session, media, folders, folderId, mediaType, success, error),
    );
  } catch (e) {
    return htmlResponse(
      mediaListPage(
        session, [], [], undefined, undefined, undefined,
        `Failed to load media: ${errorMessage(e)}`,
      ),
    );
  }
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
 * Uses handleMultipartUpload to resolve auth, parse multipart form,
 * validate CSRF, extract file, and upload to Xibo.
 */
const handleMediaUploadPost = (request: Request): Promise<Response> =>
  handleMultipartUpload(
    request,
    () => resolveAuthConfig(request),
    (ctx, msg) => uploadError(ctx.session, ctx.config, msg, 400),
    (ctx) => uploadError(ctx.session, ctx.config, "Please select a file to upload", 400),
    (ctx, file, formData) => {
      const folderId = (formData.get("folderId") as string) || "";
      return uploadToXibo(ctx.config, file, extractUploadName(formData, file), folderId, "/admin/media", (msg) =>
        uploadError(ctx.session, ctx.config, msg));
    },
  );

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

    return uploadToXibo(config, fileObj, name, folderId, "/admin/media", (msg) =>
      uploadError(session, config, msg));
  },
);

/**
 * GET /admin/media/:id — view media details
 */
const handleMediaDetailGet = detailRoute(
  async (session, config, params) => {
    const media = await findMediaById(config, Number(params.id));
    if (!media) return htmlResponse("<h1>Media Not Found</h1>", 404);
    return htmlResponse(mediaDetailPage(session, media));
  },
);

/**
 * GET /admin/media/:id/preview — proxy image preview from Xibo CMS
 */
const handleMediaPreviewGet = detailRoute(
  (_session, config, params) =>
    proxyMediaPreview(config, params.id!),
);

/**
 * POST /admin/media/:id/delete — delete media
 */
const handleMediaDeletePost = deleteRoute(
  (p) => `library/${p.id}`,
  "/admin/media",
  "Media deleted",
);

// ─── Shared Photo Repository ─────────────────────────────────────────

/**
 * GET /admin/media/shared — browse shared photo repository
 */
const handleSharedMediaGet = sessionRoute(async (session, config, request) => {
  const { success, error } = getQueryMessages(request);

  const sharedFolderId = await getSharedFolderId();
  if (sharedFolderId === null) {
    return htmlResponse(
      sharedMediaListPage(
        session, [], success,
        "Shared folder not configured. Set a shared folder ID in settings.",
      ),
    );
  }

  try {
    const allMedia = await fetchAllMedia(config);
    const sharedMedia = filter(
      (m: XiboMedia) => m.folderId === sharedFolderId,
    )(allMedia);
    return htmlResponse(sharedMediaListPage(session, sharedMedia, success, error));
  } catch (e) {
    return htmlResponse(
      sharedMediaListPage(
        session, [], undefined,
        `Failed to load shared photos: ${errorMessage(e)}`,
      ),
    );
  }
});

/**
 * GET /admin/media/shared/upload — shared photo upload form
 */
const handleSharedUploadGet = sessionRoute(
  (session) =>
    Promise.resolve(htmlResponse(sharedMediaUploadPage(session))),
);

/**
 * POST /admin/media/shared/upload — upload PNG to shared folder.
 * Uses handleMultipartUpload with extended context including sharedFolderId.
 */
const handleSharedUploadPost = async (request: Request): Promise<Response> => {
  const result = await resolveAuthConfig(request);
  if (result instanceof Response) return result;
  return handleMultipartUpload(
    request,
    async () => {
      const sharedFolderId = await getSharedFolderId();
      if (sharedFolderId === null) {
        return htmlResponse(sharedMediaUploadPage(result.session, "Shared folder not configured"), 400);
      }
      return { ...result, sharedFolderId };
    },
    (ctx, msg) => htmlResponse(sharedMediaUploadPage(ctx.session, msg), 400),
    (ctx) => htmlResponse(sharedMediaUploadPage(ctx.session, "Please select a PNG file to upload"), 400),
    (ctx, file, formData) => {
      if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) {
        return Promise.resolve(htmlResponse(
          sharedMediaUploadPage(ctx.session, "Only PNG files are accepted for shared photos"), 400,
        ));
      }
      const name = (formData.get("name") as string) || file.name.replace(/\.png$/i, "");
      return uploadToXibo(ctx.config, file, name, String(ctx.sharedFolderId), "/admin/media/shared",
        (msg) => htmlResponse(sharedMediaUploadPage(ctx.session, msg)));
    },
  );
};

/**
 * POST /admin/media/shared/:id/delete — delete from shared folder.
 * Verifies media belongs to shared folder before deleting.
 */
const handleSharedDeletePost = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  withXiboForm(request, async (_session, _form, config) => {
    const sharedFolderId = await getSharedFolderId();
    if (sharedFolderId === null) {
      return redirectWithError("/admin/media/shared", "Shared folder not configured");
    }
    return verifyAndDeleteMedia(
      config, Number(params.id), sharedFolderId,
      "/admin/media/shared", "Shared photo deleted",
      "/admin/media/shared",
      "Media not found in shared folder",
      "Media not found in shared folder",
    );
  });

/** Media routes */
export const mediaRoutes = defineRoutes({
  "GET /admin/media": (request) => handleMediaListGet(request),
  "GET /admin/media/shared": (request) => handleSharedMediaGet(request),
  "GET /admin/media/shared/upload": (request) =>
    handleSharedUploadGet(request),
  "POST /admin/media/shared/upload": (request) =>
    handleSharedUploadPost(request),
  "POST /admin/media/shared/:id/delete": (request, params) =>
    handleSharedDeletePost(request, params),
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
