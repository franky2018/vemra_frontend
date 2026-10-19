import "server-only";

import { cache } from "react";

import { AUTH_ROUTES } from "@/constants/auth";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { isUnauthorized } from "@/lib/api/errors";
import { apiGetDataOptional } from "@/lib/api/server";
import { resolveNextPath } from "@/lib/supabase/paths";
import type {
  AccountProfile,
  AccountRole,
  KycMe,
  KycState,
  KycStatus,
  OnboardingNextStep,
  Session,
  SessionUser,
  UserRole,
} from "@/types/api/auth";

export const ACTIVE_ROLE_COOKIE = "vemra_active_role";

const ROLE_MAP: Partial<Record<AccountRole, UserRole>> = {
  TENANT: "TENANT",
  LANDLORD: "LANDLORD",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  TENANT: "Tenant",
  LANDLORD: "Landlord",
};

export const ROLE_HOME: Record<UserRole, string> = {
  TENANT: "/tenant",
  LANDLORD: "/landlord",
};

export function mapAccountRole(role: AccountRole): UserRole | null {
  return ROLE_MAP[role] ?? null;
}

export function isUserRole(value: unknown): value is UserRole {
  return value === "TENANT" || value === "LANDLORD";
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

async function readActiveRoleCookie(): Promise<UserRole | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const value = store.get(ACTIVE_ROLE_COOKIE)?.value;
  return isUserRole(value) ? value : null;
}

async function toSession(account: AccountProfile): Promise<Session> {
  const name = account.displayName ?? account.email;
  const roles = [
    ...new Set(
      account.roles
        .map(mapAccountRole)
        .filter((role): role is UserRole => role !== null),
    ),
  ];

  const requested = await readActiveRoleCookie();
  const activeRole =
    requested !== null && roles.includes(requested)
      ? requested
      : (roles[0] ?? "TENANT");

  const kyc = await getKycState();

  const user: SessionUser = {
    id: account.userId,
    name,
    initials: initialsFrom(name),
    email: account.email,
    phone: account.phone,
    avatarUrl: account.avatarUrl ?? null,
    roles,
    isEmailVerified: account.emailVerified,
    isIdentityVerified: kyc.approved,
  };

  return { user, activeRole, expiresAt: null };
}

async function readAccount(): Promise<AccountProfile | null> {
  try {
    return await apiGetDataOptional<AccountProfile>(ENDPOINTS.identity.me);
  } catch (error) {
    if (isUnauthorized(error)) {
      return null;
    }
    throw error;
  }
}

export const getAccount = cache(readAccount);

const KYC_STATUSES: readonly KycStatus[] = [
  "PENDING",
  "SUBMITTED",
  "UNDER_REVIEW",
  "ACTION_REQUIRED",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
];

function readKycStatus(value: unknown): KycStatus | null {
  return typeof value === "string" &&
    (KYC_STATUSES as readonly string[]).includes(value)
    ? (value as KycStatus)
    : null;
}

function readNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTextOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * `/kyc/me` is the authoritative KYC record. Its shape is checked rather than
 * cast: a malformed or unrelated payload must not be mistaken for an approved
 * verification.
 */
function toKycMe(value: unknown): KycMe | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const status = readKycStatus(record.status);
  if (status === null) {
    return null;
  }

  return {
    id: typeof record.id === "string" ? record.id : "",
    userId: typeof record.userId === "string" ? record.userId : "",
    status,
    attemptsRemaining: readNumberOrNull(record.attemptsRemaining),
    applicantMessage: readTextOrNull(record.applicantMessage),
    decisionReason: readTextOrNull(record.decisionReason),
    maskedNin: readTextOrNull(record.maskedNin),
    decidedAt: readTextOrNull(record.decidedAt),
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
  };
}

function nextStepForStatus(status: KycStatus | null): OnboardingNextStep {
  switch (status) {
    case "APPROVED":
      return "COMPLETE";
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return "UNDER_REVIEW";
    case "ACTION_REQUIRED":
    case "REJECTED":
      return "ACTION_REQUIRED";
    default:
      return "KYC_SUBMISSION";
  }
}

/**
 * The caller's KYC state, read from `/kyc/me` first and `/me.onboarding` as the
 * fallback while the backend is still wiring the dedicated route. An unknown
 * status (`null`) is never approved.
 */
export const getKycState = cache(async (): Promise<KycState> => {
  const account = await getAccount();
  const fallback = account?.onboarding ?? null;

  let record: KycMe | null = null;
  try {
    record = toKycMe(await apiGetDataOptional<unknown>(ENDPOINTS.kyc.me));
  } catch {
    // `/kyc/me` is optional in the current backend; fall back to `/me`.
  }

  const kycStatus = record?.status ?? fallback?.kycStatus ?? null;
  const attemptsRemaining =
    record !== null
      ? record.attemptsRemaining
      : (fallback?.attemptsRemaining ?? null);
  const applicantMessage =
    record !== null
      ? (record.applicantMessage ?? record.decisionReason)
      : (fallback?.applicantMessage ?? null);

  return {
    approved: kycStatus === "APPROVED",
    kycStatus,
    nextStep:
      record !== null
        ? nextStepForStatus(kycStatus)
        : (fallback?.nextStep ?? nextStepForStatus(kycStatus)),
    attemptsRemaining,
    applicantMessage,
  };
});

/** Where a user should go to progress their KYC case, by status. */
export function verificationPathFor(status: KycStatus | null): string {
  switch (status) {
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return AUTH_ROUTES.verificationPending;
    case "REJECTED":
    case "ACTION_REQUIRED":
      return AUTH_ROUTES.verificationRejected;
    default:
      return AUTH_ROUTES.signupVerification;
  }
}

export const getSession = cache(async (): Promise<Session | null> => {
  const account = await getAccount();
  return account === null ? null : toSession(account);
});

export const requireSession = cache(
  async (redirectTo?: string): Promise<Session> => {
    const session = await getSession();
    if (session !== null) {
      return session;
    }

    const { redirect } = await import("next/navigation");
    const target =
      redirectTo === undefined
        ? "/login"
        : `/login?next=${encodeURIComponent(redirectTo)}`;
    return redirect(target);
  },
);

export function homePathFor(roles: readonly UserRole[]): string {
  const first = roles[0];
  return first === undefined ? "/login" : ROLE_HOME[first];
}

export async function requireRole(
  role: UserRole,
  redirectTo?: string,
): Promise<Session> {
  const session = await requireSession(redirectTo);

  if (session.user.roles.includes(role)) {
    return session.activeRole === role
      ? session
      : { ...session, activeRole: role };
  }

  const { redirect } = await import("next/navigation");
  return redirect(homePathFor(session.user.roles));
}

/**
 * Guards a page or server action behind an approved KYC check.
 *
 * Redirects by status: unfinished or expired cases go to the submission flow,
 * submitted/under-review to the pending screen, rejected/action-required to the
 * rejected screen. `returnTo` is validated with `resolveNextPath`, so a crafted
 * `next` value cannot turn this into an open redirect.
 */
export async function requireKycApproved(
  returnTo?: string,
): Promise<Session> {
  const session = await requireSession(returnTo);

  // KYC applies to tenants and landlords only; staff are exempt.
  if (session.activeRole !== "TENANT" && session.activeRole !== "LANDLORD") {
    return session;
  }

  const state = await getKycState();
  if (state.approved) {
    return session;
  }

  const { redirect } = await import("next/navigation");
  const next = resolveNextPath(
    returnTo ?? null,
    ROLE_HOME[session.activeRole],
  );
  const target = verificationPathFor(state.kycStatus);

  return redirect(`${target}?next=${encodeURIComponent(next)}`);
}
