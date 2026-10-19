import type { Metadata } from "next";

import { HourglassIcon } from "@/components/icons/hourglass-icon";
import { VERIFICATION_PENDING_SCREEN } from "@/constants/auth";
import { VerificationStatus } from "@/features/auth/verification-status";
import { kycReviewRows } from "@/features/auth/verification-steps";
import { getKycState } from "@/lib/api/resources/auth";

export const metadata: Metadata = {
  title: "Verification in review · Vemra",
  description: VERIFICATION_PENDING_SCREEN.description,
};

export const dynamic = "force-dynamic";

export default async function VerificationPendingPage() {
  const kyc = await getKycState();
  const rows = kycReviewRows(
    kyc.kycStatus ?? "UNDER_REVIEW",
    kyc.applicantMessage,
  );

  return (
    <VerificationStatus
      tone="warning"
      icon={<HourglassIcon />}
      title={VERIFICATION_PENDING_SCREEN.title}
      description={
        kyc.applicantMessage ?? VERIFICATION_PENDING_SCREEN.description
      }
      cardLabel={VERIFICATION_PENDING_SCREEN.cardLabel}
      rows={rows}
      note={VERIFICATION_PENDING_SCREEN.note}
      ctaLabel={VERIFICATION_PENDING_SCREEN.ctaLabel}
      ctaHref={VERIFICATION_PENDING_SCREEN.ctaHref}
    />
  );
}
