/**
 * Admin business management routes - manager or above
 */

import { filter, mapAsync } from "#fp";
import { logAuditEvent } from "#lib/db/audit-events.ts";
import {
  assignUserToBusiness,
  createBusiness,
  deleteBusiness,
  getAllBusinesses,
  getBusinessById,
  getBusinessUserIds,
  removeUserFromBusiness,
  toDisplayBusiness,
  updateBusiness,
  updateBusinessXiboIds,
} from "#lib/db/businesses.ts";
import { getScreensForBusiness, toDisplayScreen } from "#lib/db/screens.ts";
import {
  decryptAdminLevel,
  decryptUsername,
  getAllUsers,
  getUserById,
} from "#lib/db/users.ts";
import { validateForm, type ValidationResult } from "#lib/forms.tsx";
import type { Business, User } from "#lib/types.ts";
import { post } from "#xibo/client.ts";
import type { XiboConfig, XiboDataset, XiboFolder } from "#xibo/types.ts";
import { defineRoutes, type RouteParams } from "#routes/router.ts";
import type { AuthSession } from "#routes/utils.ts";
import {
  htmlResponse,
  redirectWithError,
  redirectWithSuccess,
  requireManagerOrAbove,
  withManagerAuthForm,
} from "#routes/utils.ts";
import {
  getQueryMessages,
  toAdminSession,
  withEntity,
  withXiboConfig,
  xiboThenPersist,
} from "#routes/route-helpers.ts";
import {
  adminBusinessCreatePage,
  adminBusinessDetailPage,
  adminBusinessesPage,
  type BusinessUser,
} from "#templates/admin/businesses.tsx";
import { businessFields, type BusinessFormValues } from "#templates/fields.ts";

/** Validate business form fields */
const validateBusinessFields = (form: URLSearchParams): ValidationResult<BusinessFormValues> =>
  validateForm<BusinessFormValues>(form, businessFields);

/** Generate a random 6-character alphanumeric string */
const randomSuffix = (): string => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
};

/** Xibo dataset column data type IDs */
const XIBO_STRING_TYPE = 1;
const XIBO_NUMBER_TYPE = 2;

/** Dataset columns to create for a business */
const DATASET_COLUMNS = [
  { heading: "name", dataTypeId: XIBO_STRING_TYPE, columnOrder: 1 },
  { heading: "price", dataTypeId: XIBO_STRING_TYPE, columnOrder: 2 },
  { heading: "image_id", dataTypeId: XIBO_NUMBER_TYPE, columnOrder: 3 },
  { heading: "available", dataTypeId: XIBO_NUMBER_TYPE, columnOrder: 4 },
  { heading: "sort_order", dataTypeId: XIBO_NUMBER_TYPE, columnOrder: 5 },
] as const;

/** Convert a User record to a BusinessUser for display */
const toBusinessUser = async (user: User): Promise<BusinessUser> => ({
  id: user.id,
  username: await decryptUsername(user),
  adminLevel: await decryptAdminLevel(user),
});

/** Get user-role users who are/aren't assigned to a business */
const getUsersForBusiness = async (
  businessId: number,
): Promise<{ assigned: BusinessUser[]; available: BusinessUser[] }> => {
  const [allUsers, assignedIds] = await Promise.all([
    getAllUsers(),
    getBusinessUserIds(businessId),
  ]);

  const allDisplay = await Promise.all(allUsers.map(toBusinessUser));
  const userRoleOnly = filter((u: BusinessUser) => u.adminLevel === "user")(allDisplay);

  const assignedSet = new Set(assignedIds);
  const assigned = filter((u: BusinessUser) => assignedSet.has(u.id))(userRoleOnly);
  const available = filter((u: BusinessUser) => !assignedSet.has(u.id))(userRoleOnly);

  return { assigned, available };
};


/** Resources provisioned in Xibo for a business */
type ProvisionedResources = {
  folderId: number;
  folderName: string;
  datasetId: number;
};

/**
 * Provision Xibo folder and dataset for a business.
 * Returns resource IDs on success — throws on failure.
 * Does NOT write to the database — caller uses xiboThenPersist to guard DB writes.
 */
const provisionXiboResources = async (
  config: XiboConfig,
  businessName: string,
): Promise<ProvisionedResources> => {
  const folderName = `${businessName}-${randomSuffix()}`;

  const folder = await post<XiboFolder>(config, "folders", {
    text: folderName,
  });

  const dataset = await post<XiboDataset>(config, "dataset", {
    dataSet: folderName,
    description: `Product data for ${businessName}`,
  });

  await mapAsync((col: typeof DATASET_COLUMNS[number]) =>
    post(config, `dataset/${dataset.dataSetId}/column`, {
      heading: col.heading,
      dataTypeId: col.dataTypeId,
      dataSetColumnTypeId: 1, // Value column
      columnOrder: col.columnOrder,
    })
  )([...DATASET_COLUMNS]);

  return { folderId: folder.folderId, folderName, datasetId: dataset.dataSetId };
};

/** Load screens and user assignments for a business (shared by detail + update) */
const loadBusinessContext = async (businessId: number) => {
  const [screens, users] = await Promise.all([
    getScreensForBusiness(businessId),
    getUsersForBusiness(businessId),
  ]);
  return {
    displayScreens: await Promise.all(screens.map(toDisplayScreen)),
    ...users,
  };
};

/** Render the business detail page with full context */
const renderBusinessDetail = async (
  biz: Business,
  session: AuthSession,
  error?: string,
  success?: string,
  status?: number,
): Promise<Response> => {
  const display = await toDisplayBusiness(biz);
  const ctx = await loadBusinessContext(biz.id);
  return htmlResponse(
    adminBusinessDetailPage(
      display, ctx.displayScreens, ctx.assigned, ctx.available,
      toAdminSession(session), error, success,
    ),
    status,
  );
};

/**
 * Handle GET /admin/businesses
 */
const handleBusinessesGet = (request: Request): Promise<Response> =>
  requireManagerOrAbove(request, async (session) => {
    const businesses = await getAllBusinesses();
    const display = await Promise.all(businesses.map(toDisplayBusiness));
    const { error, success } = getQueryMessages(request);
    return htmlResponse(
      adminBusinessesPage(display, toAdminSession(session), error, success),
    );
  });

/**
 * Handle GET /admin/business/create
 */
const handleBusinessCreateGet = (request: Request): Promise<Response> =>
  requireManagerOrAbove(request, (session) =>
    Promise.resolve(
      htmlResponse(adminBusinessCreatePage(toAdminSession(session))),
    ));

/**
 * Handle POST /admin/business/create
 */
const handleBusinessCreatePost = (request: Request): Promise<Response> =>
  withManagerAuthForm(request, (session, form) => {
    const validation = validateBusinessFields(form);
    if (!validation.valid) {
      return Promise.resolve(htmlResponse(
        adminBusinessCreatePage(toAdminSession(session), validation.error),
        400,
      ));
    }

    const { name } = validation.values;

    // Provision Xibo resources first — only create DB record on success
    return withXiboConfig((config) =>
      xiboThenPersist(
        () => provisionXiboResources(config, name),
        "/admin/businesses",
        async (provision) => {
          const business = await createBusiness(name);
          await updateBusinessXiboIds(
            business.id,
            provision.folderId,
            provision.folderName,
            provision.datasetId,
          );
          await logAuditEvent({
            actorUserId: session.userId,
            action: "CREATE",
            resourceType: "business",
            detail: `Created business "${name}"`,
          });
          return redirectWithSuccess("/admin/businesses", "Business created successfully");
        },
      ),
    );
  });

/** Handle GET /admin/business/:id */
const handleBusinessDetailGet = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  requireManagerOrAbove(request, (session) =>
    withEntity(getBusinessById, Number(params.id), "Business", (biz) => {
      const msgs = getQueryMessages(request);
      return renderBusinessDetail(biz, session, msgs.error, msgs.success);
    }),
  );

/** Manager auth + business lookup by params.id — returns a route handler */
const businessFormRoute = (
  handler: (session: AuthSession, form: URLSearchParams, biz: Business) => Promise<Response>,
) =>
(request: Request, params: RouteParams): Promise<Response> =>
  withManagerAuthForm(request, (session, form) =>
    withEntity(getBusinessById, Number(params.id), "Business", (biz) =>
      handler(session, form, biz)),
  );

/** Handle POST /admin/business/:id (update name) */
const handleBusinessUpdatePost = businessFormRoute(async (session, form, biz) => {
  const validation = validateBusinessFields(form);
  if (!validation.valid) {
    return renderBusinessDetail(biz, session, validation.error, undefined, 400);
  }

  await updateBusiness(biz.id, validation.values.name);
  await logAuditEvent({
    actorUserId: session.userId,
    action: "UPDATE",
    resourceType: "business",
    resourceId: biz.id,
    detail: `Updated business ${biz.id}`,
  });
  return redirectWithSuccess(`/admin/business/${biz.id}`, "Business updated");
});

/** Handle POST /admin/business/:id/delete */
const handleBusinessDeletePost = businessFormRoute(async (session, _form, biz) => {
  await deleteBusiness(biz.id);
  await logAuditEvent({
    actorUserId: session.userId,
    action: "DELETE",
    resourceType: "business",
    resourceId: biz.id,
    detail: `Deleted business ${biz.id}`,
  });
  return redirectWithSuccess("/admin/businesses", "Business deleted");
});

/** Common pattern: load business, parse user_id from form, run action */
const withBusinessUser = (
  request: Request,
  params: RouteParams,
  noUserError: string,
  action: (businessId: number, userId: number, session: AuthSession) => Promise<Response>,
): Promise<Response> =>
  businessFormRoute((session, form, biz) => {
    const userId = Number(form.get("user_id"));
    if (!userId) {
      return Promise.resolve(
        redirectWithError(`/admin/business/${biz.id}`, noUserError),
      );
    }
    return action(biz.id, userId, session);
  })(request, params);

/** Log a business-user membership change */
const logBusinessUserChange = (
  session: AuthSession,
  businessId: number,
  detail: string,
): Promise<void> =>
  logAuditEvent({
    actorUserId: session.userId,
    action: "UPDATE",
    resourceType: "business",
    resourceId: businessId,
    detail,
  });

/** Handle POST /admin/business/:id/assign-user */
const handleAssignUser = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  withBusinessUser(request, params, "Please select a user", async (businessId, userId, session) => {
    const user = await getUserById(userId);
    if (!user) {
      return redirectWithError(`/admin/business/${businessId}`, "User not found");
    }
    const level = await decryptAdminLevel(user);
    if (level !== "user") {
      return redirectWithError(`/admin/business/${businessId}`, "Only user-role users can be assigned");
    }

    await assignUserToBusiness(businessId, userId);
    await logBusinessUserChange(session, businessId, `Assigned user ${userId} to business ${businessId}`);
    return redirectWithSuccess(`/admin/business/${businessId}`, "User assigned");
  });

/** Handle POST /admin/business/:id/remove-user */
const handleRemoveUser = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  withBusinessUser(request, params, "Invalid user", async (businessId, userId, session) => {
    await removeUserFromBusiness(businessId, userId);
    await logBusinessUserChange(session, businessId, `Removed user ${userId} from business ${businessId}`);
    return redirectWithSuccess(`/admin/business/${businessId}`, "User removed");
  });

/** Business management routes */
export const businessRoutes = defineRoutes({
  "GET /admin/businesses": handleBusinessesGet,
  "GET /admin/business/create": handleBusinessCreateGet,
  "POST /admin/business/create": handleBusinessCreatePost,
  "GET /admin/business/:id": handleBusinessDetailGet,
  "POST /admin/business/:id": handleBusinessUpdatePost,
  "POST /admin/business/:id/delete": handleBusinessDeletePost,
  "POST /admin/business/:id/assign-user": handleAssignUser,
  "POST /admin/business/:id/remove-user": handleRemoveUser,
});
