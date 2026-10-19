import { describe, expect, it, vi } from "vitest";

import type { KycState } from "@/types/api/auth";

vi.mock("next/link", () => ({ default: () => null }));

const { kycBannerCopy } = await import("@/features/kyc/kyc-banner");
const { AUTH_ROUTES } = await import("@/constants/auth");

function state(overrides: Partial<KycState> = {}): KycState {
  return {
    approved: false,
    kycStatus: "PENDING",
    nextStep: "KYC_SUBMISSION",
    attemptsRemaining: null,
    applicantMessage: null,
    ...overrides,
  };
}

describe("kycBannerCopy", () => {
  it("renders nothing once approved", () => {
    expect(kycBannerCopy(state({ kycStatus: "APPROVED", approved: true }), "TENANT")).toBeNull();
  });

  it("asks a landlord to verify before listing", () => {
    const copy = kycBannerCopy(state({ kycStatus: null }), "LANDLORD");

    expect(copy).toMatchObject({
      variant: "action",
      title: "Complete your verification",
      body: "Complete your verification to list properties on Vemra.",
      ctaLabel: "Start now",
      ctaHref: AUTH_ROUTES.signupVerification,
      note: null,
    });
  });

  it("asks a tenant to verify before renting", () => {
    const copy = kycBannerCopy(state({ kycStatus: "PENDING" }), "TENANT");

    expect(copy?.body).toBe(
      "Complete your verification to rent a home on Vemra.",
    );
  });

  it("treats an expired case as actionable", () => {
    const copy = kycBannerCopy(state({ kycStatus: "EXPIRED" }), "TENANT");

    expect(copy?.variant).toBe("action");
    expect(copy?.ctaHref).toBe(AUTH_ROUTES.signupVerification);
  });

  it.each(["SUBMITTED", "UNDER_REVIEW"] as const)(
    "shows a neutral, actionless banner for %s",
    (status) => {
      const copy = kycBannerCopy(state({ kycStatus: status }), "TENANT");

      expect(copy).toMatchObject({
        variant: "review",
        title: "Your verification is under review",
        ctaLabel: null,
        ctaHref: null,
      });
    },
  );

  it.each(["ACTION_REQUIRED", "REJECTED"] as const)(
    "shows the reviewer message and attempts for %s",
    (status) => {
      const copy = kycBannerCopy(
        state({
          kycStatus: status,
          applicantMessage: "The ID was blurry.",
          attemptsRemaining: 2,
        }),
        "LANDLORD",
      );

      expect(copy).toMatchObject({
        variant: "fix",
        title: "Your verification needs attention",
        body: "The ID was blurry.",
        note: "2 attempts remaining.",
        ctaLabel: "Fix and resubmit",
        ctaHref: AUTH_ROUTES.verificationRejected,
      });
    },
  );

  it("uses the singular form for one remaining attempt", () => {
    const copy = kycBannerCopy(
      state({ kycStatus: "REJECTED", attemptsRemaining: 1 }),
      "TENANT",
    );

    expect(copy?.note).toBe("1 attempt remaining.");
  });

  it("hides the attempts note when the backend omits it", () => {
    const copy = kycBannerCopy(
      state({ kycStatus: "REJECTED", attemptsRemaining: null }),
      "TENANT",
    );

    expect(copy?.note).toBeNull();
    expect(copy?.body).not.toBe("");
  });
});
