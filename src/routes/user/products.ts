/**
 * User product management routes
 *
 * Products are rows in a per-business Xibo dataset. Users manage them
 * through the dashboard UI, with all CRUD operations hitting the
 * Xibo dataset data API.
 */

import { filter, map } from "#fp";
import { getSharedFolderId } from "#lib/db/settings.ts";
import { validateForm } from "#lib/forms.tsx";
import type { DisplayBusiness } from "#lib/db/businesses.ts";
import { get, post, put, del } from "#xibo/client.ts";
import { fetchAllMedia } from "#xibo/media-ops.ts";
import type {
  DatasetProduct,
  XiboConfig,
  XiboDatasetRow,
  XiboMedia,
} from "#xibo/types.ts";
import type { AuthSession } from "#routes/utils.ts";
import { htmlResponse, redirectWithError, redirectWithSuccess } from "#routes/utils.ts";
import { defineRoutes } from "#routes/router.ts";
import {
  errorMessage,
  getQueryMessages,
  toAdminSession,
  withXiboForm,
} from "#routes/admin/utils.ts";
import { userBusinessDetailRoute, withUserBusiness } from "#routes/user/utils.ts";
import {
  userProductCreatePage,
  userProductEditPage,
  userProductListPage,
} from "#templates/user/products.tsx";
import { datasetProductFields, type DatasetProductFormValues } from "#templates/fields.ts";

// ─── Data Helpers ──────────────────────────────────────────────────

/** Column headings in the business dataset */
const COL = {
  NAME: "name",
  PRICE: "price",
  MEDIA_ID: "media_id",
  AVAILABLE: "available",
  SORT_ORDER: "sort_order",
} as const;

/** Parse a Xibo dataset row into a typed DatasetProduct */
const parseProduct = (row: XiboDatasetRow): DatasetProduct => ({
  id: Number(row["id"] ?? 0),
  name: String(row[COL.NAME] ?? ""),
  price: String(row[COL.PRICE] ?? "0"),
  media_id: row[COL.MEDIA_ID] !== null && row[COL.MEDIA_ID] !== ""
    ? Number(row[COL.MEDIA_ID])
    : null,
  available: Number(row[COL.AVAILABLE] ?? 1),
  sort_order: Number(row[COL.SORT_ORDER] ?? 0),
});

/** Fetch all products from a business dataset */
const fetchProducts = async (
  config: XiboConfig,
  datasetId: number,
): Promise<DatasetProduct[]> =>
  map(parseProduct)(await get<XiboDatasetRow[]>(config, `dataset/data/${datasetId}`));

/** Find a specific product by row ID within a dataset */
const findProduct = async (
  config: XiboConfig,
  datasetId: number,
  rowId: number,
): Promise<DatasetProduct | null> =>
  (await fetchProducts(config, datasetId)).find((p) => p.id === rowId) ?? null;

/** Get media options for the image picker — shared + business-owned images */
const getMediaOptions = async (
  config: XiboConfig,
  businessFolderId: number | null,
): Promise<{ mediaId: number; name: string }[]> => {
  const allMedia = await fetchAllMedia(config);
  const sharedFolderId = await getSharedFolderId();

  return map((m: XiboMedia) => ({ mediaId: m.mediaId, name: m.name }))(
    filter((m: XiboMedia) =>
      m.mediaType === "image" &&
      (m.folderId === businessFolderId ||
        (sharedFolderId !== null && m.folderId === sharedFolderId))
    )(allMedia),
  );
};

/** Silently load media options, returning [] on failure */
const safeGetMediaOptions = async (
  config: XiboConfig,
  folderId: number | null,
): Promise<{ mediaId: number; name: string }[]> => {
  try {
    return await getMediaOptions(config, folderId);
  } catch {
    return [];
  }
};

/** Build the dataset row body for create/update */
const buildRowBody = (
  values: DatasetProductFormValues,
  extra: { available?: number; sort_order?: number } = {},
): Record<string, unknown> => ({
  [COL.NAME]: values.name,
  [COL.PRICE]: values.price,
  [COL.MEDIA_ID]: values.media_id ?? "",
  [COL.AVAILABLE]: extra.available ?? 1,
  [COL.SORT_ORDER]: extra.sort_order ?? 0,
});

/** Base URL for product routes */
const productsUrl = (businessId: number): string =>
  `/dashboard/business/${businessId}/products`;

// ─── Shared access-control + API helpers ────────────────────────────

/** Result of resolving business + dataset access for mutation routes */
type BusinessCtx = { business: DisplayBusiness; datasetId: number; businessId: number };

/**
 * Verify user has access to the business AND it has a dataset provisioned.
 * Returns the business context on success, or a redirect Response on failure.
 */
export const requireBusinessDataset = async (
  userId: number,
  businessId: number,
): Promise<BusinessCtx | Response> => {
  const result = await withUserBusiness(userId, businessId);
  if (result instanceof Response) return result;
  if (result.xibo_dataset_id === null) {
    return redirectWithError(productsUrl(businessId), "Business dataset not provisioned");
  }
  return { business: result, datasetId: result.xibo_dataset_id, businessId };
};

/** Resolve business + dataset, then call onSuccess. Returns the error response on failure. */
const withBusinessDataset = async (
  userId: number,
  businessId: number,
  onSuccess: (ctx: BusinessCtx) => Promise<Response>,
): Promise<Response> => {
  const result = await requireBusinessDataset(userId, businessId);
  return result instanceof Response ? result : onSuccess(result);
};

/** Fetch a product by ID, returning it or a redirect on error/not-found */
const requireProduct = async (
  config: XiboConfig,
  ctx: BusinessCtx,
  rowId: number,
): Promise<DatasetProduct | Response> => {
  try {
    const p = await findProduct(config, ctx.datasetId, rowId);
    return p ?? redirectWithError(productsUrl(ctx.businessId), "Product not found");
  } catch (e) {
    return redirectWithError(productsUrl(ctx.businessId), errorMessage(e));
  }
};

/**
 * Execute a Xibo API call and redirect. On success redirects with a success message,
 * on failure redirects with the error message.
 */
const apiCallAndRedirect = async (
  apiCall: () => Promise<unknown>,
  businessId: number,
  successMsg: string,
): Promise<Response> => {
  try {
    await apiCall();
    return redirectWithSuccess(productsUrl(businessId), successMsg);
  } catch (e) {
    return redirectWithError(productsUrl(businessId), errorMessage(e));
  }
};

/**
 * Common mutation handler: authenticate, validate CSRF, resolve business+dataset,
 * then delegate to the provided action.
 */
const productMutation = (
  action: (
    form: URLSearchParams,
    config: XiboConfig,
    ctx: BusinessCtx,
    rowId: string,
  ) => Promise<Response>,
) =>
  (request: Request, params: Record<string, string | undefined>): Promise<Response> =>
    withXiboForm(request, (session, form, config) =>
      withBusinessDataset(session.userId, Number(params.id), (ctx) =>
        action(form, config, ctx, params.rowId ?? "")));

/**
 * Validate product form, then call API method and redirect on success.
 * Used by both create and update handlers.
 */
const validateAndSave = (
  form: URLSearchParams,
  config: XiboConfig,
  ctx: BusinessCtx,
  apiMethod: typeof post | typeof put,
  endpoint: string,
  msg: string,
): Promise<Response> => {
  const v = validateForm<DatasetProductFormValues>(form, datasetProductFields);
  return v.valid
    ? apiCallAndRedirect(() => apiMethod(config, endpoint, buildRowBody(v.values)), ctx.businessId, msg)
    : Promise.resolve(htmlResponse(v.error, 400));
};

/**
 * Product detail route: composes userBusinessDetailRoute with requireBusinessDataset.
 * Resolves business + dataset access before calling the handler.
 */
const productDetailRoute = (
  handler: (
    session: AuthSession,
    config: XiboConfig,
    ctx: BusinessCtx,
    params: Record<string, string | undefined>,
  ) => Promise<Response>,
) =>
  userBusinessDetailRoute((session, config, _routeCtx, params) =>
    withBusinessDataset(session.userId, Number(params.id), (ctx) =>
      handler(session, config, ctx, params)));

// ─── Route Handlers ────────────────────────────────────────────────

/** GET /dashboard/business/:id/products — list products */
const handleProductList = userBusinessDetailRoute(
  async (session, config, _ctx, params, request) => {
    const business = await withUserBusiness(session.userId, Number(params.id));
    if (business instanceof Response) return business;

    const { success, error: queryError } = getQueryMessages(request);
    let products: DatasetProduct[] = [];
    let error: string | undefined = queryError;

    if (business.xibo_dataset_id === null) {
      error = "Business dataset not provisioned. Contact your administrator.";
    } else {
      try {
        products = await fetchProducts(config, business.xibo_dataset_id);
      } catch (e) {
        error = `Failed to load products: ${errorMessage(e)}`;
      }
    }

    return htmlResponse(
      userProductListPage(toAdminSession(session), business, products, success, error),
    );
  },
);

/** GET /dashboard/business/:id/product/create — create form */
const handleProductCreateGet = productDetailRoute(
  async (session, config, ctx) => {
    const media = await safeGetMediaOptions(config, ctx.business.xibo_folder_id);
    return htmlResponse(userProductCreatePage(toAdminSession(session), ctx.business, media));
  },
);

/** POST /dashboard/business/:id/product/create — add dataset row */
const handleProductCreatePost = productMutation((form, config, ctx) =>
  validateAndSave(form, config, ctx, post, `dataset/data/${ctx.datasetId}`, "Product added"));

/** GET /dashboard/business/:id/product/:rowId — edit form */
const handleProductEditGet = productDetailRoute(
  async (session, config, ctx, params) => {
    const product = await requireProduct(config, ctx, Number(params.rowId));
    if (product instanceof Response) return product;

    const media = await safeGetMediaOptions(config, ctx.business.xibo_folder_id);
    return htmlResponse(
      userProductEditPage(toAdminSession(session), ctx.business, product, media),
    );
  },
);

/** POST /dashboard/business/:id/product/:rowId — update dataset row */
const handleProductEditPost = productMutation((form, config, ctx, rowId) =>
  validateAndSave(form, config, ctx, put, `dataset/data/${ctx.datasetId}/${rowId}`, "Product updated"));

/** POST /dashboard/business/:id/product/:rowId/delete — delete dataset row */
const handleProductDelete = productMutation((_form, config, ctx, rowId) =>
  apiCallAndRedirect(() => del(config, `dataset/data/${ctx.datasetId}/${rowId}`), ctx.businessId, "Product deleted"));

/** POST /dashboard/business/:id/product/:rowId/toggle — toggle availability */
const handleProductToggle = productMutation(async (_form, config, ctx, rowId) => {
  const product = await requireProduct(config, ctx, Number(rowId));
  if (product instanceof Response) return product;

  const newAvailable = product.available === 1 ? 0 : 1;
  return apiCallAndRedirect(
    () => put(
      config,
      `dataset/data/${ctx.datasetId}/${product.id}`,
      buildRowBody(
        { name: product.name, price: product.price, media_id: product.media_id },
        { available: newAvailable, sort_order: product.sort_order },
      ),
    ),
    ctx.businessId,
    newAvailable === 1 ? "Product enabled" : "Product disabled",
  );
});

/** User product routes */
export const userProductRoutes = defineRoutes({
  "GET /dashboard/business/:id/products": handleProductList,
  "GET /dashboard/business/:id/product/create": handleProductCreateGet,
  "POST /dashboard/business/:id/product/create": handleProductCreatePost,
  "GET /dashboard/business/:id/product/:rowId": handleProductEditGet,
  "POST /dashboard/business/:id/product/:rowId": handleProductEditPost,
  "POST /dashboard/business/:id/product/:rowId/delete": handleProductDelete,
  "POST /dashboard/business/:id/product/:rowId/toggle": handleProductToggle,
});
