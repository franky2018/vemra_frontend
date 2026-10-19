import type { Metadata } from "next";

import { AlertTriangleIcon } from "@/components/icons/alert-triangle-icon";
import { VERIFICATION_REJECTED_SCREEN } from "@/constants/auth";
import { VerificationStatus } from "@/features/auth/verification-status";
import { kycReviewRows } from "@/features/auth/verification-steps";
import { getKycState } from "@/lib/api/resources/auth";

export const metadata: Metadata = {
  title: "One document needs a fix · Vemra",
  description: VERIFICATION_REJECTED_SCREEN.description,
};

export const dynamic = "force-dynamic";

export default async function VerificationRejectedPage() {
  const kyc = await getKycState();
  const rows = kycReviewRows(kyc.kycStatus ?? "REJECTED", kyc.applicantMessage);

  return (
    <VerificationStatus
      tone="error"
      icon={<AlertTriangleIcon />}
      title={VERIFICATION_REJECTED_SCREEN.title}
      description={
        kyc.applicantMessage ?? VERIFICATION_REJECTED_SCREEN.description
      }
      cardLabel={VERIFICATION_REJECTED_SCREEN.cardLabel}
      rows={rows}
      ctaLabel={VERIFICATION_REJECTED_SCREEN.ctaLabel}
      ctaHref={VERIFICATION_REJECTED_SCREEN.ctaHref}
    />
  );
}
