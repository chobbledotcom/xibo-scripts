/**
 * User menu screen management routes
 *
 * Menu screens are user-configured Xibo layouts built from layout
 * templates. Users create them, pick products, and the system
 * generates Xibo layouts, campaigns, and schedules automatically.
 */

import { mapAsync } from "#fp";
import type { DisplayBusiness } from "#lib/db/businesses.ts";
import { getScreenById, toDisplayScreen } from "#lib/db/screens.ts";
import type { DisplayScreen } from "#lib/db/screens.ts";
import {
  createMenuScreen,
  deleteMenuScreen,
  getMenuScreenById,
  getMenuScreenItems,
  getMenuScreensForScreen,
  setMenuScreenItems,
  toDisplayMenuScreen,
  updateMenuScreen,
  updateMenuScreenCampaignId,
  updateMenuScreenLayoutId,
} from "#lib/db/menu-screens.ts";
import type { DisplayMenuScreen } from "#lib/db/menu-screens.ts";
import type { MenuScreen } from "#lib/types.ts";
import { validateForm } from "#lib/forms.tsx";
import {
  buildLayoutFromTemplate,
  getTemplateById,
  TEMPLATES,
} from "#lib/templates/index.ts";
import type { TemplateProduct } from "#lib/templates/index.ts";
import { del } from "#xibo/client.ts";
import { rebuildScreenSchedule } from "#xibo/scheduling.ts";
import type { DatasetProduct, XiboConfig } from "#xibo/types.ts";
import { defineRoutes } from "#routes/router.ts";
import { htmlResponse, redirectWithError, redirectWithSuccess } from "#routes/utils.ts";
import { errorMessage, getQueryMessages, toAdminSession, withXiboForm } from "#routes/route-helpers.ts";
import { userBusinessDetailRoute, withUserBusiness } from "#routes/user/utils.ts";
import { fetchProducts } from "#routes/user/data-helpers.ts";
import { menuScreenFields, type MenuScreenFormValues } from "#templates/fields.ts";
import {
  userMenuScreenCreatePage,
  userMenuScreenEditPage,
  userMenuScreenListPage,
} from "#templates/user/menu-screens.tsx";

// ─── URL helpers ───────────────────────────────────────────────────

const menusUrl = (bizId: number, screenId: number): string =>
  `/dashboard/business/${bizId}/screen/${screenId}/menus`;

// ─── Access control helpers ────────────────────────────────────────

/** Result of requireScreen when successful */
type ScreenCtx = { business: DisplayBusiness; screen: DisplayScreen };

/** Verify user access to business + screen, returning display objects or error response */
const requireScreen = async (
  userId: number,
  bizId: number,
  screenId: number,
): Promise<ScreenCtx | Response> => {
  const business = await withUserBusiness(userId, bizId);
  if (business instanceof Response) return business;

  const screen = await getScreenById(screenId);
  if (!screen || screen.business_id !== bizId) {
    return htmlResponse("<h1>Screen not found</h1>", 404);
  }

  return { business, screen: await toDisplayScreen(screen) };
};

/** Parse bizId + screenId from route params, validate screen access, and pass context to handler */
const withScreenCtx = async <T>(
  userId: number,
  params: Record<string, string | undefined>,
  handler: (sc: { bizId: number; screenId: number; ctx: ScreenCtx }) => T | Promise<T>,
): Promise<T | Response> => {
  const bizId = Number(params.bizId);
  const screenId = Number(params.screenId);
  const result = await requireScreen(userId, bizId, screenId);
  if (result instanceof Response) return result;
  return handler({ bizId, screenId, ctx: result });
};

/** Load menu screens for a screen and decrypt them for display */
const loadDisplayMenuScreens = async (
  screenId: number,
): Promise<{ menuScreens: MenuScreen[]; display: DisplayMenuScreen[] }> => {
  const menuScreens = await getMenuScreensForScreen(screenId);
  const display = await Promise.all(menuScreens.map(toDisplayMenuScreen));
  return { menuScreens, display };
};

/** Parse product_ids from form (checkbox group returns multiple values) */
const parseProductIds = (form: URLSearchParams): number[] =>
  form.getAll("product_ids").map(Number).filter((n) => !isNaN(n));

/** Convert selected products into TemplateProduct[] for layout building */
const toTemplateProducts = (
  products: DatasetProduct[],
  selectedIds: number[],
): TemplateProduct[] => {
  const idSet = new Set(selectedIds);
  return products
    .filter((p) => idSet.has(p.id))
    .map((p) => ({ name: p.name, price: p.price }));
};

/**
 * Look up a menu screen by ID and verify it belongs to the given screen.
 * Returns the menu screen or a redirect error response.
 */
const requireMenuScreen = async (
  menuScreenId: number,
  screenId: number,
  bizId: number,
): Promise<MenuScreen | Response> => {
  const menuScreen = await getMenuScreenById(menuScreenId);
  if (!menuScreen || menuScreen.screen_id !== screenId) {
    return redirectWithError(
      menusUrl(bizId, screenId),
      "Menu screen not found",
    );
  }
  return menuScreen;
};

/**
 * Validate template selection and product count from form data.
 * Returns validated form values + template + productIds, or a redirect on error.
 */
type ValidatedMenuForm = {
  v: { values: MenuScreenFormValues };
  templateId: string;
  productIds: number[];
};
const validateMenuForm = (
  form: URLSearchParams,
  bizId: number,
  screenId: number,
): ValidatedMenuForm | Response => {
  const v = validateForm<MenuScreenFormValues>(form, menuScreenFields);
  if (!v.valid) return htmlResponse(v.error, 400);

  const templateId = form.get("template_id") || "";
  const template = getTemplateById(templateId);
  if (!template) {
    return redirectWithError(menusUrl(bizId, screenId), "Invalid template");
  }

  const productIds = parseProductIds(form);
  if (productIds.length > template.maxProducts) {
    return redirectWithError(
      menusUrl(bizId, screenId),
      `Too many products selected (max ${template.maxProducts})`,
    );
  }

  return { v: v as { values: MenuScreenFormValues }, templateId, productIds };
};

/**
 * Fetch products and convert selected ones into TemplateProduct[] for layout building.
 */
const fetchTemplateProducts = async (
  config: XiboConfig,
  datasetId: number | null,
  productIds: number[],
): Promise<TemplateProduct[]> => {
  if (datasetId === null || productIds.length === 0) return [];
  const products = await fetchProducts(config, datasetId);
  return toTemplateProducts(products, productIds);
};

/** Silently try to delete an old Xibo layout */
const deleteOldLayout = async (
  config: XiboConfig,
  layoutId: number | null,
): Promise<void> => {
  if (layoutId === null) return;
  try {
    await del(config, `layout/${layoutId}`);
  } catch {
    // Layout may already be deleted
  }
};

/**
 * Safely fetch products for a business, returning empty array on failure.
 * Used by create/edit GET forms to populate the product picker.
 */
const safeFetchProducts = async (
  config: XiboConfig,
  datasetId: number | null,
): Promise<DatasetProduct[]> => {
  if (datasetId === null) return [];
  try {
    return await fetchProducts(config, datasetId);
  } catch {
    return [];
  }
};

/**
 * Set items, optionally delete old layout, build from template, and save layout ID.
 * Shared by both create and edit POST handlers.
 */
const saveItemsAndBuild = async (
  config: XiboConfig,
  menuScreenId: number,
  templateId: string,
  name: string,
  datasetId: number | null,
  productIds: number[],
  oldLayoutId: number | null = null,
): Promise<void> => {
  await setMenuScreenItems(menuScreenId, productIds);
  await deleteOldLayout(config, oldLayoutId);
  const templateProducts = await fetchTemplateProducts(config, datasetId, productIds);
  const layout = await buildLayoutFromTemplate(config, templateId, name, templateProducts);
  await updateMenuScreenLayoutId(menuScreenId, layout.layoutId);
};

/** Route handler accepting request + params */
type MutationHandler = (request: Request, params: Record<string, string | undefined>) => Promise<Response>;

/**
 * HOF for menu screen mutation routes.
 * Handles withXiboForm + param parsing + requireScreen + error wrapping.
 */
const menuScreenMutation = (
  handler: (
    config: XiboConfig,
    ctx: ScreenCtx,
    bizId: number,
    screenId: number,
    menuScreenId: number,
    form: URLSearchParams,
  ) => Promise<Response>,
): MutationHandler =>
  (request, params) =>
    withXiboForm(request, (session, form, config) =>
      withScreenCtx(session.userId, params, (sc) =>
        handler(config, sc.ctx, sc.bizId, sc.screenId, Number(params.id), form)));

/** Screen + menu screen context for detail mutations */
type DetailCtx = ScreenCtx & { menuScreen: MenuScreen };

/**
 * HOF for menu screen detail mutation routes.
 * Extends menuScreenMutation to also fetch + validate the menu screen.
 */
const menuScreenDetailMutation = (
  handler: (
    config: XiboConfig,
    ctx: DetailCtx,
    bizId: number,
    screenId: number,
    form: URLSearchParams,
  ) => Promise<Response>,
) =>
  menuScreenMutation(async (config, ctx, bizId, screenId, menuScreenId, form) => {
    const menuScreen = await requireMenuScreen(menuScreenId, screenId, bizId);
    if (menuScreen instanceof Response) return menuScreen;
    return handler(config, { ...ctx, menuScreen }, bizId, screenId, form);
  });

/** Rebuild campaign/schedule after a menu screen change */
const refreshSchedule = async (
  config: XiboConfig,
  screenId: number,
  screenName: string,
  displayId: number | null,
  existingCampaignId: number | null,
): Promise<number | null> => {
  if (displayId === null) return existingCampaignId;

  const { menuScreens, display } = await loadDisplayMenuScreens(screenId);

  const { campaignId } = await rebuildScreenSchedule(
    config,
    display,
    screenName,
    displayId,
    existingCampaignId,
  );

  await mapAsync((ms: MenuScreen) =>
    updateMenuScreenCampaignId(ms.id, campaignId)
  )(menuScreens);

  return campaignId;
};

/**
 * Execute a menu screen mutation action with try/catch + schedule refresh + redirect.
 * Consolidates the common pattern across create, edit, and delete handlers.
 */
const menuScreenAction = async (
  action: () => Promise<void>,
  config: XiboConfig,
  screenId: number,
  ctx: ScreenCtx,
  existingCampaignId: number | null,
  bizId: number,
  successMsg: string,
): Promise<Response> => {
  try {
    await action();
    await refreshSchedule(config, screenId, ctx.screen.name, ctx.screen.xibo_display_id, existingCampaignId);
    return redirectWithSuccess(menusUrl(bizId, screenId), successMsg);
  } catch (e) {
    return redirectWithError(menusUrl(bizId, screenId), errorMessage(e));
  }
};

/**
 * Validate menu form, then execute the action within menuScreenAction.
 * Consolidates the validate + action pattern shared by create and edit POST.
 */
const validatedMenuAction = (
  form: URLSearchParams,
  bizId: number,
  screenId: number,
  config: XiboConfig,
  ctx: ScreenCtx,
  existingCampaignId: number | null,
  successMsg: string,
  action: (v: MenuScreenFormValues, templateId: string, productIds: number[]) => Promise<void>,
): Promise<Response> => {
  const validated = validateMenuForm(form, bizId, screenId);
  if (validated instanceof Response) return Promise.resolve(validated);
  const { v, templateId, productIds } = validated;
  return menuScreenAction(
    () => action(v.values, templateId, productIds),
    config, screenId, ctx, existingCampaignId, bizId, successMsg,
  );
};

// ─── Route Handlers ────────────────────────────────────────────────

/** GET /dashboard/business/:bizId/screen/:screenId/menus -- list menu screens */
const handleMenuScreenList = userBusinessDetailRoute(
  (session, _config, _ctx, params, request) =>
    withScreenCtx(session.userId, params, async (sc) => {
      const messages = getQueryMessages(request);
      const { display } = await loadDisplayMenuScreens(sc.screenId);

      return htmlResponse(
        userMenuScreenListPage(
          toAdminSession(session),
          sc.ctx.business,
          sc.ctx.screen,
          display,
          messages.success,
          messages.error,
        ),
      );
    }),
);

/** GET /dashboard/business/:bizId/screen/:screenId/menu/create -- create form */
const handleMenuScreenCreateGet = userBusinessDetailRoute(
  (session, config, _ctx, params) =>
    withScreenCtx(session.userId, params, async (sc) => {
      const products = await safeFetchProducts(config, sc.ctx.business.xibo_dataset_id);

      return htmlResponse(
        userMenuScreenCreatePage(
          toAdminSession(session),
          sc.ctx.business,
          sc.ctx.screen,
          TEMPLATES,
          products,
        ),
      );
    }),
);

/** POST /dashboard/business/:bizId/screen/:screenId/menu/create -- create menu screen + layout */
const handleMenuScreenCreatePost = menuScreenMutation(
  (config, ctx, bizId, screenId, _menuScreenId, form) =>
    validatedMenuAction(form, bizId, screenId, config, ctx, null, "Menu screen created",
      async (values, templateId, productIds) => {
        const menuScreen = await createMenuScreen(
          values.name, screenId, templateId,
          values.display_time as number, values.sort_order as number,
        );
        await saveItemsAndBuild(config, menuScreen.id, templateId, values.name, ctx.business.xibo_dataset_id, productIds);
      },
    ),
);

/** GET /dashboard/business/:bizId/screen/:screenId/menu/:id -- edit form */
const handleMenuScreenEditGet = userBusinessDetailRoute(
  (session, config, _ctx, params) =>
    withScreenCtx(session.userId, params, async ({ bizId, screenId, ctx }) => {
      const menuScreen = await requireMenuScreen(Number(params.id), screenId, bizId);
      if (menuScreen instanceof Response) return menuScreen;

      const displayMs = await toDisplayMenuScreen(menuScreen);
      const items = await getMenuScreenItems(menuScreen.id);
      const selectedProductIds = items.map((i) => i.product_row_id);
      const products = await safeFetchProducts(config, ctx.business.xibo_dataset_id);

      return htmlResponse(
        userMenuScreenEditPage(
          toAdminSession(session),
          ctx.business,
          ctx.screen,
          displayMs,
          TEMPLATES,
          products,
          selectedProductIds,
        ),
      );
    }),
);

/** POST /dashboard/business/:bizId/screen/:screenId/menu/:id -- update menu screen */
const handleMenuScreenEditPost = menuScreenDetailMutation(
  (config, ctx, bizId, screenId, form) =>
    validatedMenuAction(form, bizId, screenId, config, ctx, ctx.menuScreen.xibo_campaign_id, "Menu screen updated",
      async (values, templateId, productIds) => {
        await updateMenuScreen(
          ctx.menuScreen.id, values.name, templateId,
          values.display_time as number, values.sort_order as number,
        );
        await saveItemsAndBuild(config, ctx.menuScreen.id, templateId, values.name, ctx.business.xibo_dataset_id, productIds, ctx.menuScreen.xibo_layout_id);
      },
    ),
);

/** POST /dashboard/business/:bizId/screen/:screenId/menu/:id/delete -- delete menu screen */
const handleMenuScreenDelete = menuScreenDetailMutation(
  (config, ctx, bizId, screenId, _form) =>
    menuScreenAction(
      async () => {
        await deleteOldLayout(config, ctx.menuScreen.xibo_layout_id);
        await deleteMenuScreen(ctx.menuScreen.id);
      },
      config, screenId, ctx, ctx.menuScreen.xibo_campaign_id, bizId, "Menu screen deleted",
    ),
);

/** User menu screen routes */
export const userMenuScreenRoutes = defineRoutes({
  "GET /dashboard/business/:bizId/screen/:screenId/menus": (request, params) =>
    handleMenuScreenList(request, params),
  "GET /dashboard/business/:bizId/screen/:screenId/menu/create": (
    request,
    params,
  ) => handleMenuScreenCreateGet(request, params),
  "POST /dashboard/business/:bizId/screen/:screenId/menu/create":
    handleMenuScreenCreatePost,
  "GET /dashboard/business/:bizId/screen/:screenId/menu/:id": (
    request,
    params,
  ) => handleMenuScreenEditGet(request, params),
  "POST /dashboard/business/:bizId/screen/:screenId/menu/:id":
    handleMenuScreenEditPost,
  "POST /dashboard/business/:bizId/screen/:screenId/menu/:id/delete":
    handleMenuScreenDelete,
});
