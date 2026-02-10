/**
 * Privacy-safe logging utilities
 *
 * - Request logging: logs method, path, status, duration
 * - Error logging: logs classified error codes without PII
 */

/**
 * Error codes for classified error logging
 * Format: E_CATEGORY_DETAIL
 */
export const ErrorCode = {
  // Database errors
  DB_CONNECTION: "E_DB_CONNECTION",
  DB_QUERY: "E_DB_QUERY",

  // Encryption/decryption errors
  DECRYPT_FAILED: "E_DECRYPT_FAILED",
  ENCRYPT_FAILED: "E_ENCRYPT_FAILED",
  KEY_DERIVATION: "E_KEY_DERIVATION",

  // Authentication errors
  AUTH_INVALID_SESSION: "E_AUTH_INVALID_SESSION",
  AUTH_EXPIRED: "E_AUTH_EXPIRED",
  AUTH_CSRF_MISMATCH: "E_AUTH_CSRF_MISMATCH",
  AUTH_RATE_LIMITED: "E_AUTH_RATE_LIMITED",

  // Xibo API errors
  XIBO_API_CONNECTION: "E_XIBO_API_CONNECTION",
  XIBO_API_AUTH: "E_XIBO_API_AUTH",
  XIBO_API_REQUEST: "E_XIBO_API_REQUEST",

  // Validation errors
  VALIDATION_FORM: "E_VALIDATION_FORM",
  VALIDATION_CONTENT_TYPE: "E_VALIDATION_CONTENT_TYPE",

  // Configuration errors
  CONFIG_MISSING: "E_CONFIG_MISSING",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Redact dynamic segments from paths for privacy-safe logging
 * Replaces numeric IDs in admin paths
 */
export const redactPath = (path: string): string => {
  // Redact numeric IDs in admin paths: /admin/menuboards/123 -> /admin/menuboards/[id]
  return path.replace(/\/(\d+)(\/|$)/g, "/[id]$2");
};

/**
 * Request log entry (privacy-safe)
 */
type RequestLogEntry = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
};

/**
 * Log a completed request to console.debug
 * Path is automatically redacted for privacy
 */
export const logRequest = (entry: RequestLogEntry): void => {
  const { method, path, status, durationMs } = entry;
  const redactedPath = redactPath(path);

  // biome-ignore lint/suspicious/noConsole: Intentional debug logging
  console.debug(
    `[Request] ${method} ${redactedPath} ${status} ${durationMs}ms`,
  );
};

/**
 * Error log context (privacy-safe metadata only)
 */
type ErrorContext = {
  /** Error code for classification */
  code: ErrorCodeType;
  /** Optional: additional safe context */
  detail?: string;
};

/**
 * Log a classified error to console.error
 * Only logs error codes and safe metadata, never PII
 */
export const logError = (context: ErrorContext): void => {
  const { code, detail } = context;

  const parts = [
    `[Error] ${code}`,
    detail ? `detail="${detail}"` : null,
  ].filter(Boolean);

  // biome-ignore lint/suspicious/noConsole: Intentional error logging
  console.error(parts.join(" "));
};

/**
 * Create a request timer for measuring duration
 */
export const createRequestTimer = (): (() => number) => {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
};

/**
 * Log categories for debug logging
 */
export type LogCategory = "Setup" | "Auth" | "Xibo" | "DB";

/**
 * Log a debug message with category prefix
 * For detailed debugging during development
 */
export const logDebug = (category: LogCategory, message: string): void => {
  // biome-ignore lint/suspicious/noConsole: Intentional debug logging
  console.debug(`[${category}] ${message}`);
};
