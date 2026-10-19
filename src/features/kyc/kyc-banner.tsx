import Link from "next/link";

import { AlertTriangleIcon } from "@/components/icons/alert-triangle-icon";
import { HourglassIcon } from "@/components/icons/hourglass-icon";
import { ShieldIcon } from "@/components/icons/shield-icon";
import { buttonClasses } from "@/components/ui/button";
import { AUTH_ROUTES } from "@/constants/auth";
import type { KycState, UserRole } from "@/types/api/auth";

export type KycBannerVariant = "action" | "review" | "fix";

export interface KycBannerCopy {
  variant: KycBannerVariant;
  title: string;
  body: string;
  /** Extra line, e.g. attempts remaining on a rejected case. */
  note: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
}

function attemptsNote(attempts: number | null): string | null {
  if (attempts === null) {
    return null;
  }
  return `${attempts} attempt${attempts === 1 ? "" : "s"} remaining.`;
}

/**
 * The banner shown on a tenant or landlord overview until KYC is approved.
 *
 * Kept as a pure function so every status/role combination can be asserted
 * without rendering. Returns `null` for approved users — they get no banner.
 */
export function kycBannerCopy(
  state: KycState,
  role: UserRole,
): KycBannerCopy | null {
  switch (state.kycStatus) {
    case "APPROVED":
      return null;

    case "SUBMITTED":
    case "UNDER_REVIEW":
      return {
        variant: "review",
        title: "Your verification is under review",
        body:
          state.applicantMessage ??
          "We're checking your documents. We'll email you when it's done.",
        note: null,
        ctaLabel: null,
        ctaHref: null,
      };

    case "ACTION_REQUIRED":
    case "REJECTED":
      return {
        variant: "fix",
        title: "Your verification needs attention",
        body:
          state.applicantMessage ??
          "One of your documents needs a fix before we can approve it.",
        note: attemptsNote(state.attemptsRemaining),
        ctaLabel: "Fix and resubmit",
        ctaHref: AUTH_ROUTES.verificationRejected,
      };

    // Not started, PENDING and EXPIRED all need the same action.
    default:
      return {
        variant: "action",
        title: "Complete your verification",
        body:
          role === "LANDLORD"
            ? "Complete your verification to list properties on Vemra."
            : "Complete your verification to rent a home on Vemra.",
        note: null,
        ctaLabel: "Start now",
        ctaHref: AUTH_ROUTES.signupVerification,
      };
  }
}

const VARIANT_STYLES: Record<
  KycBannerVariant,
  { panel: string; icon: string; Icon: typeof AlertTriangleIcon }
> = {
  action: {
    panel: "border-brand-700 bg-brand-50",
    icon: "text-brand-700",
    Icon: ShieldIcon,
  },
  review: {
    panel: "border-neutral-200 bg-neutral-50",
    icon: "text-neutral-700",
    Icon: HourglassIcon,
  },
  fix: {
    panel: "border-warning-600 bg-warning-50",
    icon: "text-warning-600",
    Icon: AlertTriangleIcon,
  },
};

export interface KycBannerProps {
  state: KycState;
  role: UserRole;
}

/**
 * Dashboard banner for an incomplete KYC case. Not dismissible: it disappears
 * only when the case is approved.
 */
export function KycBanner({ state, role }: KycBannerProps) {
  const copy = kycBannerCopy(state, role);
  if (copy === null) {
    return null;
  }

  const { panel, icon, Icon } = VARIANT_STYLES[copy.variant];

  return (
    <section
      role="status"
      aria-label="Identity verification"
      className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between md:p-5 ${panel}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 size-5 shrink-0 ${icon}`} />
        <div className="flex flex-col gap-0.5">
          <h2 className="text-body-md font-semibold text-neutral-900">
            {copy.title}
          </h2>
          <p className="text-body-sm text-neutral-800">{copy.body}</p>
          {copy.note === null ? null : (
            <p className="text-label-sm font-semibold text-neutral-800">
              {copy.note}
            </p>
          )}
        </div>
      </div>

      {copy.ctaLabel === null || copy.ctaHref === null ? null : (
        <Link
          href={copy.ctaHref}
          className={buttonClasses({ size: "sm", className: "shrink-0" })}
        >
          {copy.ctaLabel}
        </Link>
      )}
    </section>
  );
}
