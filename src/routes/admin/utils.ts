/**
 * Admin route utilities
 */

/** Clear session cookie on logout */
export const clearSessionCookie =
  "__Host-session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
