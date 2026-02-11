/**
 * Types for the Xibo CMS management system
 */

export interface Settings {
  key: string;
  value: string;
}

export interface Session {
  token: string; // Contains the hashed token for DB storage
  csrf_token: string;
  expires: number;
  wrapped_data_key: string | null;
  user_id: number;
}

/** Admin role levels */
export type AdminLevel = "owner" | "manager" | "user";

/** Impersonation info displayed in the UI banner */
export type ImpersonationInfo = {
  readonly username: string;
  readonly userId: number;
};

/** Session data needed by admin page templates */
export type AdminSession = {
  readonly csrfToken: string;
  readonly adminLevel: AdminLevel;
  readonly impersonating?: ImpersonationInfo;
};

export interface User {
  id: number;
  username_hash: string; // encrypted at rest, decrypted to display
  username_index: string; // HMAC hash for lookups
  password_hash: string; // PBKDF2 hash encrypted at rest
  wrapped_data_key: string | null; // wrapped with user's KEK
  admin_level: string; // encrypted "owner", "manager", or "user"
  invite_code_hash: string | null; // encrypted SHA-256 of invite token, null after password set
  invite_expiry: string | null; // encrypted ISO 8601, null after password set
}
