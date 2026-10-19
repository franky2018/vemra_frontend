export type ApiErrorKind = "network" | "timeout" | "http" | "parse";

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "GONE",
  "UNPROCESSABLE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "NOT_IMPLEMENTED",
  "SERVICE_UNAVAILABLE",
  "FEATURE_NOT_ENABLED",
  "KYC_REQUIRED",
  "CAUTION_DEPOSIT_POLICY_UNCONFIGURED",
  "SETTING_NOT_CONFIGURED",
  "SETTING_VALUE_INVALID",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorInit {
  kind: ApiErrorKind;
  message: string;
  status?: number | null;
  code?: string | null;
  fieldErrors?: Readonly<Record<string, string>> | null;
  details?: unknown;
  requestId?: string | null;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly fieldErrors: Readonly<Record<string, string>> | null;
  readonly details: unknown;
  readonly requestId: string | null;

  constructor({
    kind,
    message,
    status = null,
    code = null,
    fieldErrors = null,
    details = undefined,
    requestId = null,
    cause,
  }: ApiErrorInit) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.details = details;
    this.requestId = requestId;
  }

  get isRetryable(): boolean {
    if (this.kind === "network" || this.kind === "timeout") {
      return true;
    }
    if (this.code === "RATE_LIMITED" || this.code === "SERVICE_UNAVAILABLE") {
      return true;
    }
    if (this.status === null) {
      return false;
    }
    return this.status === 429 || this.status >= 500;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function errorCode(error: unknown): string | null {
  return isApiError(error) ? error.code : null;
}

export function errorRequestId(error: unknown): string | null {
  return isApiError(error) ? error.requestId : null;
}

function matches(error: unknown, code: ErrorCode, status: number): boolean {
  if (!isApiError(error)) {
    return false;
  }
  return error.code === code || (error.code === null && error.status === status);
}

export function isUnauthorized(error: unknown): boolean {
  return matches(error, "UNAUTHENTICATED", 401);
}

export function isForbidden(error: unknown): boolean {
  return matches(error, "FORBIDDEN", 403);
}

export function isNotFound(error: unknown): boolean {
  return matches(error, "NOT_FOUND", 404);
}

export function isConflict(error: unknown): boolean {
  return matches(error, "CONFLICT", 409);
}

export function isRateLimited(error: unknown): boolean {
  return matches(error, "RATE_LIMITED", 429);
}

export function isFeatureNotEnabled(error: unknown): boolean {
  return isApiError(error) && error.code === "FEATURE_NOT_ENABLED";
}

export function isKycRequired(error: unknown): boolean {
  return isApiError(error) && error.code === "KYC_REQUIRED";
}

export function isValidationError(error: unknown): boolean {
  if (!isApiError(error)) {
    return false;
  }
  if (error.code === "VALIDATION_ERROR" || error.code === "UNPROCESSABLE") {
    return true;
  }
  return error.code === null && (error.status === 400 || error.status === 422);
}

export function isTimeout(error: unknown): boolean {
  return isApiError(error) && error.kind === "timeout";
}

const CODE_MESSAGES: Partial<Record<ErrorCode, string>> = {
  UNAUTHENTICATED: "Your session has expired. Please log in again.",
  FORBIDDEN: "You do not have access to this.",
  NOT_FOUND: "We could not find what you were looking for.",
  CONFLICT: "That change conflicts with the current state. Please refresh and try again.",
  GONE: "That is no longer available.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
  INTERNAL_ERROR: "Vemra is having trouble right now. Please try again shortly.",
  NOT_IMPLEMENTED: "This is not available yet.",
  SERVICE_UNAVAILABLE: "Vemra is having trouble right now. Please try again shortly.",
  FEATURE_NOT_ENABLED: "This feature is not enabled on your account yet.",
  KYC_REQUIRED:
    "Complete your identity verification to continue.",
  CAUTION_DEPOSIT_POLICY_UNCONFIGURED:
    "Vemra has not set a caution deposit policy for this property yet.",
  SETTING_NOT_CONFIGURED: "Vemra has not finished configuring this yet.",
};

export function apiErrorMessage(error: unknown): string {
  if (!isApiError(error)) {
    return "Something went wrong. Please try again.";
  }

  switch (error.kind) {
    case "timeout":
      return "Vemra is waking up and took too long to answer. Please try again in a moment.";
    case "network":
      return "Could not reach Vemra. Check your connection and try again.";
    case "parse":
      return "Vemra sent an unexpected response. Please try again.";
    case "http":
      break;
  }

  if (error.code !== null) {
    const byCode = CODE_MESSAGES[error.code as ErrorCode];
    if (byCode !== undefined) {
      return byCode;
    }
    if (error.code === "VALIDATION_ERROR" || error.code === "UNPROCESSABLE") {
      return withFieldErrors(error.message, error.fieldErrors);
    }
  }

  if (error.status === 401) {
    return CODE_MESSAGES.UNAUTHENTICATED as string;
  }
  if (error.status === 403) {
    return CODE_MESSAGES.FORBIDDEN as string;
  }
  if (error.status === 404) {
    return CODE_MESSAGES.NOT_FOUND as string;
  }
  if (error.status === 429) {
    return CODE_MESSAGES.RATE_LIMITED as string;
  }
  if (error.status !== null && error.status >= 500) {
    return CODE_MESSAGES.INTERNAL_ERROR as string;
  }

  return error.message;
}

/**
 * Backend validation failures often arrive as a generic "Request validation
 * failed." with the real reason in `fieldErrors` (parsed from `details`).
 * Appending it turns an unactionable message into "… failed. (contentType:
 * Invalid content type)".
 */
function withFieldErrors(
  message: string,
  fieldErrors: Readonly<Record<string, string>> | null,
): string {
  if (fieldErrors === null) {
    return message;
  }

  const reasons = Object.entries(fieldErrors)
    .filter(([, reason]) => typeof reason === "string" && reason.trim() !== "")
    .map(([field, reason]) => `${field}: ${reason}`);

  return reasons.length === 0 ? message : `${message} (${reasons.join("; ")})`;
}

export function supportReference(error: unknown): string | null {
  const id = errorRequestId(error);
  return id === null ? null : id;
}
