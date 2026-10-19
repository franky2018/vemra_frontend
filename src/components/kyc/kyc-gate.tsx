import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClasses } from "@/components/ui/button";

export interface KycGateProps {
  approved: boolean;
  /** Where the user goes to complete verification. */
  href: string;
  /** Label for the disabled stand-in control. */
  label: string;
  description?: string;
  children: ReactNode;
}

/**
 * Replaces a protected control with a disabled stand-in and a link to the
 * verification flow, so an unverified user never clicks into a failure.
 *
 * Server component on purpose: it is used to gate links/buttons rendered by
 * server pages, and it renders `children` untouched once approved.
 */
export function KycGate({
  approved,
  href,
  label,
  description,
  children,
}: KycGateProps) {
  if (approved) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled
        className={buttonClasses({ variant: "secondary", fullWidth: true })}
      >
        {label}
      </button>
      <p className="text-label-sm text-neutral-800">
        {description ?? "Complete identity verification to continue."}
      </p>
      <Link
        href={href}
        className="text-label-sm font-semibold text-brand-700 underline-offset-2 hover:underline"
      >
        Complete verification
      </Link>
    </div>
  );
}
