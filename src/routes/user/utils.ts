/**
 * User route utilities
 *
 * Provides HOFs for user-facing routes that handle session auth,
 * Xibo config loading, and business context resolution.
 */

import {
  getBusinessById,
  getBusinessesForUser,
  getBusinessUserIds,
  toDisplayBusiness,
} from "#lib/db/businesses.ts";
import type { DisplayBusiness } from "#lib/db/businesses.ts";
import type { XiboConfig } from "#xibo/types.ts";
import type { AuthSession } from "#routes/utils.ts";
import { htmlResponse } from "#routes/utils.ts";
import { detailRoute, sessionRoute } from "#routes/route-helpers.ts";

/** Route params from URL patterns */
type Params = Record<string, string | undefined>;

/** Single-request route handler */
type RequestHandler = (request: Request) => Promise<Response>;

/** Route handler with URL params */
type ParamHandler = (request: Request, params: Params) => Promise<Response>;

/** Business context available to user route handlers */
export type UserBusinessContext = {
  activeBusiness: DisplayBusiness;
  allBusinesses: DisplayBusiness[];
};

/**
 * Resolve the active business for a user.
 * If the user has multiple businesses, the `businessId` query param selects one.
 * Returns the business context or null if no businesses are assigned.
 */
export const resolveBusinessContext = async (
  request: Request,
  userId: number,
): Promise<UserBusinessContext | null> => {
  const businesses = await getBusinessesForUser(userId);
  if (businesses.length === 0) return null;

  const allBusinesses = await Promise.all(businesses.map(toDisplayBusiness));

  const params = new URL(request.url).searchParams;
  const requestedId = params.get("businessId");
  const requestedBusiness = requestedId
    ? allBusinesses.find((b) => b.id === Number(requestedId))
    : undefined;

  const activeBusiness = requestedBusiness ?? allBusinesses[0]!;

  return { activeBusiness, allBusinesses };
};

/** No-business-assigned error page */
const noBusinessResponse = (): Response =>
  htmlResponse(
    "<h1>No Business Assigned</h1><p>You are not assigned to any business. Contact your administrator.</p>",
    403,
  );

/**
 * Resolve business context or return 403. Shared by all user route HOFs.
 */
const withBusinessContext = async (
  request: Request,
  session: AuthSession,
  handler: (ctx: UserBusinessContext) => Promise<Response>,
): Promise<Response> => {
  const ctx = await resolveBusinessContext(request, session.userId);
  if (!ctx) return noBusinessResponse();
  return handler(ctx);
};

/**
 * Require authenticated session + Xibo config + business context.
 * Composes sessionRoute with business context resolution.
 */
export const userBusinessRoute = (
  handler: (
    session: AuthSession, config: XiboConfig,
    ctx: UserBusinessContext, request: Request,
  ) => Promise<Response>,
): RequestHandler =>
  sessionRoute((session, config, request) =>
    withBusinessContext(request, session, (ctx) =>
      handler(session, config, ctx, request)));

/**
 * User business route with URL params.
 * Composes detailRoute with business context resolution.
 */
export const userBusinessDetailRoute = (
  handler: (
    session: AuthSession,
    config: XiboConfig,
    ctx: UserBusinessContext,
    params: Params,
    request: Request,
  ) => Promise<Response>,
): ParamHandler =>
  detailRoute((session, config, params, request) =>
    withBusinessContext(request, session, (ctx) =>
      handler(session, config, ctx, params, request)));

/**
 * Verify a user has access to a specific business by ID.
 * Returns the decrypted DisplayBusiness on success, or a 403/404 Response on failure.
 */
export const withUserBusiness = async (
  userId: number,
  businessId: number,
): Promise<DisplayBusiness | Response> => {
  const business = await getBusinessById(businessId);
  if (!business) {
    return htmlResponse("<h1>Business not found</h1>", 404);
  }

  const userIds = await getBusinessUserIds(businessId);
  if (!userIds.includes(userId)) {
    return htmlResponse(
      "<h1>Access Denied</h1><p>You do not have access to this business.</p>",
      403,
    );
  }

  return toDisplayBusiness(business);
};
