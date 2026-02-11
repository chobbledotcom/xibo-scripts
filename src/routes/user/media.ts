/**
 * User media routes
 *
 * Provides media browsing, upload, and delete for business users.
 * Users see shared photos (read-only) and their own business photos (editable).
 * Media isolation is enforced by verifying folderId before any mutation.
 */

import { filter } from "#fp";
import { getSharedFolderId } from "#lib/db/settings.ts";
import type { XiboMedia } from "#xibo/types.ts";
import {
  extractUploadName,
  fetchAllMedia,
  handleMultipartUpload,
  proxyMediaPreview,
  redirectWithError,
  resolveAuthConfig,
  uploadToXibo,
  verifyAndDeleteMedia,
} from "#xibo/media-ops.ts";
import { htmlResponse, withAuthForm } from "#routes/utils.ts";
import { defineRoutes } from "#routes/router.ts";
import { errorMessage, getQueryMessages, toAdminSession, withXiboConfig } from "#routes/admin/utils.ts";
import type { UserBusinessContext } from "#routes/user/utils.ts";
import {
  resolveBusinessContext,
  userBusinessDetailRoute,
  userBusinessRoute,
} from "#routes/user/utils.ts";
import { userMediaPage, userMediaUploadPage } from "#templates/user/media.tsx";

/**
 * Render user upload page with an error.
 */
const uploadPageError = (
  session: Parameters<typeof toAdminSession>[0],
  ctx: UserBusinessContext,
  message: string,
  status = 200,
): Response =>
  htmlResponse(
    userMediaUploadPage(
      toAdminSession(session),
      ctx.activeBusiness,
      ctx.allBusinesses,
      message,
    ),
    status,
  );

/**
 * Resolve business context and validate the business folder is provisioned.
 * Returns the context + folder ID, or a Response on failure.
 */
const resolveBusinessFolder = async (
  request: Request,
  userId: number,
  onNullFolder: (ctx: UserBusinessContext) => Response | Promise<Response>,
): Promise<{ ctx: UserBusinessContext; businessFolderId: number } | Response> => {
  const ctx = await resolveBusinessContext(request, userId);
  if (!ctx) return htmlResponse("No business assigned", 403);
  if (ctx.activeBusiness.xibo_folder_id === null) return onNullFolder(ctx);
  return { ctx, businessFolderId: ctx.activeBusiness.xibo_folder_id };
};

/**
 * GET /dashboard/media — browse shared + own business photos
 */
const handleMediaGet = userBusinessRoute(
  async (session, config, ctx, request) => {
    const businessFolderId = ctx.activeBusiness.xibo_folder_id;
    const { success, error } = getQueryMessages(request);
    const sharedFolderId = await getSharedFolderId();

    let allMedia: XiboMedia[];
    try {
      allMedia = await fetchAllMedia(config);
    } catch (e) {
      return htmlResponse(
        userMediaPage(
          toAdminSession(session),
          ctx.activeBusiness,
          ctx.allBusinesses,
          [],
          [],
          undefined,
          `Failed to load media: ${errorMessage(e)}`,
        ),
      );
    }

    const sharedMedia = sharedFolderId !== null
      ? filter((m: XiboMedia) => m.folderId === sharedFolderId)(allMedia)
      : [];

    const businessMedia = businessFolderId !== null
      ? filter((m: XiboMedia) => m.folderId === businessFolderId)(allMedia)
      : [];

    return htmlResponse(
      userMediaPage(
        toAdminSession(session),
        ctx.activeBusiness,
        ctx.allBusinesses,
        sharedMedia,
        businessMedia,
        success,
        error,
      ),
    );
  },
);

/**
 * GET /dashboard/media/upload — upload form
 */
const handleUploadGet = userBusinessRoute(
  (session, _config, ctx) =>
    Promise.resolve(htmlResponse(
      userMediaUploadPage(
        toAdminSession(session),
        ctx.activeBusiness,
        ctx.allBusinesses,
      ),
    )),
);

/**
 * POST /dashboard/media/upload — upload to business folder.
 * Uses handleMultipartUpload with business context resolution.
 */
const handleUploadPost = async (request: Request): Promise<Response> => {
  const auth = await resolveAuthConfig(request);
  if (auth instanceof Response) return auth;
  return handleMultipartUpload(
    request,
    async () => {
      const bf = await resolveBusinessFolder(request, auth.session.userId,
        (ctx) => uploadPageError(auth.session, ctx, "Business folder not provisioned. Contact your administrator.", 400));
      if (bf instanceof Response) return bf;
      return { ...auth, ctx: bf.ctx, businessFolderId: bf.businessFolderId };
    },
    (rctx, msg) => uploadPageError(rctx.session, rctx.ctx, msg, 400),
    (rctx) => uploadPageError(rctx.session, rctx.ctx, "Please select a file to upload", 400),
    (rctx, file, formData) =>
      uploadToXibo(rctx.config, file, extractUploadName(formData, file), String(rctx.businessFolderId),
        "/dashboard/media", (msg) => uploadPageError(rctx.session, rctx.ctx, msg)),
  );
};

/**
 * POST /dashboard/media/:id/delete — delete from own business folder only.
 * Uses withAuthForm for CSRF validation, then verifies folder ownership.
 */
const handleDeletePost = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  withAuthForm(request, (session, _form) =>
    withXiboConfig(async (config) => {
      const bf = await resolveBusinessFolder(request, session.userId,
        () => redirectWithError("/dashboard/media", "Business folder not provisioned"));
      if (bf instanceof Response) return bf;
      return verifyAndDeleteMedia(
        config, Number(params.id), bf.businessFolderId,
        "/dashboard/media", "Photo deleted",
        "/dashboard/media",
        "Media not found",
        "You can only delete your own business photos",
      );
    }));

/**
 * GET /dashboard/media/:id/preview — image preview proxy
 */
const handlePreviewGet = userBusinessDetailRoute(
  (_session, config, _ctx, params) =>
    proxyMediaPreview(config, params.id!),
);

/** User media routes */
export const userMediaRoutes = defineRoutes({
  "GET /dashboard/media": (request) => handleMediaGet(request),
  "GET /dashboard/media/upload": (request) => handleUploadGet(request),
  "POST /dashboard/media/upload": (request) => handleUploadPost(request),
  "POST /dashboard/media/:id/delete": (request, params) =>
    handleDeletePost(request, params),
  "GET /dashboard/media/:id/preview": (request, params) =>
    handlePreviewGet(request, params),
});
