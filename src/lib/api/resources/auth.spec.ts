import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

const cookieGet = vi.fn<(name: string) => { value: string } | undefined>();
const apiGetDataOptional = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}));

vi.mock("@/lib/api/server", () => ({
  apiGetDataOptional: (path: string) => apiGetDataOptional(path),
}));

const { requireRole, homePathFor, getSession, getKycState, requireKycApproved, verificationPathFor } = await import(
  "@/lib/api/resources/auth"
);

const { ENDPOINTS } = await import("@/lib/api/endpoints");

interface AccountOverrides {
  roles?: readonly string[];
  kycStatus?: string | null;
  nextStep?: string;
  attemptsRemaining?: number | null;
  applicantMessage?: string | null;
}

function account({
  roles = ["TENANT"],
  kycStatus = "APPROVED",
  nextStep = "COMPLETE",
  attemptsRemaining = null,
  applicantMessage = null,
}: AccountOverrides = {}) {
  return {
    userId: "u1",
    email: "a@example.com",
    emailVerified: true,
    displayName: "Ada Lovelace",
    phone: null,
    handle: null,
    roles,
    accountStatus: "ACTIVE",
    onboarding: {
      nextStep,
      kycStatus,
      attemptsRemaining,
      applicantMessage,
    },
  };
}

interface KycRecordOverrides {
  status?: string;
  attemptsRemaining?: number | null;
  applicantMessage?: string | null;
  decisionReason?: string | null;
}

function kycRecord({
  status = "UNDER_REVIEW",
  attemptsRemaining = null,
  applicantMessage = null,
  decisionReason = null,
}: KycRecordOverrides = {}) {
  return {
    id: "k1",
    userId: "u1",
    status,
    attemptsRemaining,
    applicantMessage,
    decisionReason,
    maskedNin: null,
    decidedAt: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
}

function mockApi(options: {
  account?: ReturnType<typeof account> | null;
  kyc?: unknown;
  kycThrows?: boolean;
}): void {
  apiGetDataOptional.mockImplementation((path: string) => {
    if (path === ENDPOINTS.kyc.me) {
      if (options.kycThrows === true) {
        return Promise.reject(new Error("kyc unavailable"));
      }
      return Promise.resolve(options.kyc ?? null);
    }
    return Promise.resolve(options.account ?? null);
  });
}

async function expectRedirect(
  run: () => Promise<unknown>,
  target: string,
): Promise<void> {
  await expect(run()).rejects.toThrow(`REDIRECT:${target}`);
  expect(redirectMock).toHaveBeenCalledWith(target);
}

describe("homePathFor", () => {
  it("maps the first role to its dashboard", () => {
    expect(homePathFor(["TENANT"])).toBe("/tenant");
    expect(homePathFor(["LANDLORD"])).toBe("/landlord");
    expect(homePathFor(["LANDLORD", "TENANT"])).toBe("/landlord");
  });

  it("falls back to login when the user holds no supported role", () => {
    expect(homePathFor([])).toBe("/login");
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    vi.resetModules();
    redirectMock.mockClear();
    cookieGet.mockReset();
    cookieGet.mockReturnValue(undefined);
    apiGetDataOptional.mockReset();
  });

  it("returns the session when the user holds the role", async () => {
    apiGetDataOptional.mockResolvedValue(account({ roles: ["TENANT"] }));

    const session = await requireRole("TENANT");

    expect(session.user.roles).toEqual(["TENANT"]);
    expect(session.activeRole).toBe("TENANT");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects a tenant away from a landlord-only route", async () => {
    apiGetDataOptional.mockResolvedValue(account({ roles: ["TENANT"] }));

    await expectRedirect(() => requireRole("LANDLORD"), "/tenant");
  });

  it("redirects a landlord away from a tenant-only route", async () => {
    apiGetDataOptional.mockResolvedValue(account({ roles: ["LANDLORD"] }));

    await expectRedirect(() => requireRole("TENANT"), "/landlord");
  });

  it("redirects to login when there is no session", async () => {
    apiGetDataOptional.mockResolvedValue(null);

    await expectRedirect(() => requireRole("TENANT"), "/login");
  });

  it("preserves the requested path when sending an anonymous user to login", async () => {
    apiGetDataOptional.mockResolvedValue(null);

    await expectRedirect(
      () => requireRole("LANDLORD", "/landlord/statement"),
      "/login?next=%2Flandlord%2Fstatement",
    );
  });

  it("allows either role for a dual-role account", async () => {
    apiGetDataOptional.mockResolvedValue(
      account({ roles: ["TENANT", "LANDLORD"] }),
    );

    const asTenant = await requireRole("TENANT");
    expect(asTenant.activeRole).toBe("TENANT");

    const asLandlord = await requireRole("LANDLORD");
    expect(asLandlord.activeRole).toBe("LANDLORD");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("ignores roles this app does not handle", async () => {
    apiGetDataOptional.mockResolvedValue(
      account({ roles: ["SUPER_ADMIN", "SUPPORT", "PROPERTY_ADMIN"] }),
    );

    await expectRedirect(() => requireRole("TENANT"), "/login");
  });
});

describe("active role cookie", () => {
  beforeEach(() => {
    vi.resetModules();
    redirectMock.mockClear();
    cookieGet.mockReset();
    apiGetDataOptional.mockReset();
  });

  it("honours a cookie the account actually holds", async () => {
    cookieGet.mockReturnValue({ value: "LANDLORD" });
    apiGetDataOptional.mockResolvedValue(
      account({ roles: ["TENANT", "LANDLORD"] }),
    );

    const session = await getSession();
    expect(session?.activeRole).toBe("LANDLORD");
  });

  it("ignores a cookie the account does not hold", async () => {
    cookieGet.mockReturnValue({ value: "LANDLORD" });
    apiGetDataOptional.mockResolvedValue(account({ roles: ["TENANT"] }));

    const session = await getSession();
    expect(session?.activeRole).toBe("TENANT");
  });

  it("ignores a forged cookie value", async () => {
    cookieGet.mockReturnValue({ value: "SUPER_ADMIN" });
    apiGetDataOptional.mockResolvedValue(account({ roles: ["TENANT"] }));

    const session = await getSession();
    expect(session?.activeRole).toBe("TENANT");
  });
});

const KYC_STATUSES = [
  "PENDING",
  "SUBMITTED",
  "UNDER_REVIEW",
  "ACTION_REQUIRED",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
] as const;

describe("getKycState", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    cookieGet.mockReset();
    cookieGet.mockReturnValue(undefined);
    apiGetDataOptional.mockReset();
  });

  it.each(KYC_STATUSES)("reads %s from /kyc/me", async (status) => {
    mockApi({ account: account(), kyc: kycRecord({ status }) });

    const state = await getKycState();

    expect(state.kycStatus).toBe(status);
    expect(state.approved).toBe(status === "APPROVED");
  });

  it("prefers /kyc/me over /me", async () => {
    mockApi({
      account: account({ kycStatus: "APPROVED" }),
      kyc: kycRecord({ status: "REJECTED", applicantMessage: "Blurry ID" }),
    });

    const state = await getKycState();

    expect(state.kycStatus).toBe("REJECTED");
    expect(state.approved).toBe(false);
    expect(state.applicantMessage).toBe("Blurry ID");
  });

  it("falls back to /me when /kyc/me is absent", async () => {
    mockApi({
      account: account({
        kycStatus: "REJECTED",
        attemptsRemaining: 1,
        applicantMessage: "Blurry ID",
      }),
      kyc: null,
    });

    const state = await getKycState();

    expect(state.kycStatus).toBe("REJECTED");
    expect(state.approved).toBe(false);
    expect(state.attemptsRemaining).toBe(1);
    expect(state.applicantMessage).toBe("Blurry ID");
  });

  it("falls back to /me when /kyc/me errors", async () => {
    mockApi({
      account: account({ kycStatus: "APPROVED" }),
      kycThrows: true,
    });

    const state = await getKycState();

    expect(state.kycStatus).toBe("APPROVED");
    expect(state.approved).toBe(true);
  });

  it("ignores a malformed /kyc/me payload", async () => {
    mockApi({
      account: account({ kycStatus: "REJECTED" }),
      kyc: { unexpected: true },
    });

    const state = await getKycState();

    expect(state.kycStatus).toBe("REJECTED");
    expect(state.approved).toBe(false);
  });

  it("never treats an unknown status as approved", async () => {
    mockApi({
      account: account({ kycStatus: null, nextStep: "KYC_SUBMISSION" }),
      kyc: null,
    });

    const state = await getKycState();

    expect(state.kycStatus).toBeNull();
    expect(state.approved).toBe(false);
  });

  it("derives nextStep from the KYC status when /kyc/me answers", async () => {
    mockApi({ account: account(), kyc: kycRecord({ status: "APPROVED" }) });
    expect((await getKycState()).nextStep).toBe("COMPLETE");
  });
});

describe("verificationPathFor", () => {
  it("maps submitted and under-review to the pending screen", () => {
    expect(verificationPathFor("SUBMITTED")).toBe("/verification/pending");
    expect(verificationPathFor("UNDER_REVIEW")).toBe("/verification/pending");
  });

  it("maps rejected and action-required to the rejected screen", () => {
    expect(verificationPathFor("REJECTED")).toBe("/verification/rejected");
    expect(verificationPathFor("ACTION_REQUIRED")).toBe(
      "/verification/rejected",
    );
  });

  it("maps unfinished and unknown statuses to the submission flow", () => {
    expect(verificationPathFor(null)).toBe("/signup/verification");
    expect(verificationPathFor("PENDING")).toBe("/signup/verification");
    expect(verificationPathFor("EXPIRED")).toBe("/signup/verification");
  });
});

describe("requireKycApproved", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    cookieGet.mockReset();
    cookieGet.mockReturnValue(undefined);
    apiGetDataOptional.mockReset();
  });

  it("returns the session when the case is approved", async () => {
    mockApi({ account: account(), kyc: kycRecord({ status: "APPROVED" }) });

    const session = await requireKycApproved("/landlord");

    expect(session.user.isIdentityVerified).toBe(true);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("sends an unfinished case to the submission flow with next preserved", async () => {
    mockApi({
      account: account({ kycStatus: "PENDING" }),
      kyc: kycRecord({ status: "PENDING" }),
    });

    await expectRedirect(
      () => requireKycApproved("/landlord/properties/new"),
      "/signup/verification?next=%2Flandlord%2Fproperties%2Fnew",
    );
  });

  it.each(["SUBMITTED", "UNDER_REVIEW"] as const)(
    "sends %s to the pending screen",
    async (status) => {
      mockApi({
        account: account({ kycStatus: status }),
        kyc: kycRecord({ status }),
      });

      await expectRedirect(
        () => requireKycApproved("/tenant/lease"),
        "/verification/pending?next=%2Ftenant%2Flease",
      );
    },
  );

  it.each(["REJECTED", "ACTION_REQUIRED"] as const)(
    "sends %s to the rejected screen",
    async (status) => {
      mockApi({
        account: account({ kycStatus: status }),
        kyc: kycRecord({ status }),
      });

      await expectRedirect(
        () => requireKycApproved("/tenant/lease"),
        "/verification/rejected?next=%2Ftenant%2Flease",
      );
    },
  );

  it("sends an expired case to the submission flow", async () => {
    mockApi({
      account: account({ kycStatus: "EXPIRED" }),
      kyc: kycRecord({ status: "EXPIRED" }),
    });

    await expectRedirect(
      () => requireKycApproved("/tenant/payment-plan"),
      "/signup/verification?next=%2Ftenant%2Fpayment-plan",
    );
  });

  it("rejects an absolute-URL returnTo and falls back to the role home", async () => {
    mockApi({
      account: account({ kycStatus: "PENDING" }),
      kyc: kycRecord({ status: "PENDING" }),
    });

    await expectRedirect(
      () => requireKycApproved("https://evil.example.com"),
      "/signup/verification?next=%2Ftenant",
    );
  });

  it("rejects a protocol-relative returnTo", async () => {
    mockApi({
      account: account({ kycStatus: "PENDING" }),
      kyc: kycRecord({ status: "PENDING" }),
    });

    await expectRedirect(
      () => requireKycApproved("//evil.example.com/path"),
      "/signup/verification?next=%2Ftenant",
    );
  });
});
