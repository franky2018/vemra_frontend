import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * KYC gating is enforced by server redirects, so these run against real
 * accounts. They are skipped unless unverified test credentials are provided:
 *
 *   PLAYWRIGHT_UNVERIFIED_LANDLORD_EMAIL / _PASSWORD
 *   PLAYWRIGHT_UNVERIFIED_TENANT_EMAIL / _PASSWORD
 *   PLAYWRIGHT_PROPERTY_ID (a property the tenant does not own)
 */
const LANDLORD_EMAIL = process.env.PLAYWRIGHT_UNVERIFIED_LANDLORD_EMAIL;
const LANDLORD_PASSWORD = process.env.PLAYWRIGHT_UNVERIFIED_LANDLORD_PASSWORD;
const TENANT_EMAIL = process.env.PLAYWRIGHT_UNVERIFIED_TENANT_EMAIL;
const TENANT_PASSWORD = process.env.PLAYWRIGHT_UNVERIFIED_TENANT_PASSWORD;
const PROPERTY_ID = process.env.PLAYWRIGHT_PROPERTY_ID;

const VERIFICATION_URL =
  /\/(signup\/verification|verification\/(pending|rejected))(\?|$)/;

async function signIn(
  page: Page,
  role: "Tenant" | "Landlord",
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByRole("radio", { name: role }).check();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL(/\/(tenant|landlord)/);
}

test.describe("KYC gating", () => {
  test("an unverified landlord cannot reach create-listing", async ({
    page,
  }) => {
    test.skip(
      !LANDLORD_EMAIL || !LANDLORD_PASSWORD,
      "Set PLAYWRIGHT_UNVERIFIED_LANDLORD_EMAIL/PASSWORD to run this test.",
    );
    if (LANDLORD_EMAIL === undefined || LANDLORD_PASSWORD === undefined) {
      return;
    }

    await signIn(page, "Landlord", LANDLORD_EMAIL, LANDLORD_PASSWORD);
    await page.goto("/landlord/properties/new");

    await expect(page).toHaveURL(VERIFICATION_URL);
    await expect(
      page.getByRole("heading", {
        name: /verify your identity|under review|needs a fix|identity verification/i,
      }),
    ).toBeVisible();
  });

  test("an unverified tenant cannot reach apply", async ({ page }) => {
    test.skip(
      !TENANT_EMAIL || !TENANT_PASSWORD || !PROPERTY_ID,
      "Set PLAYWRIGHT_UNVERIFIED_TENANT_EMAIL/PASSWORD and PLAYWRIGHT_PROPERTY_ID to run this test.",
    );
    if (
      TENANT_EMAIL === undefined ||
      TENANT_PASSWORD === undefined ||
      PROPERTY_ID === undefined
    ) {
      return;
    }

    await signIn(page, "Tenant", TENANT_EMAIL, TENANT_PASSWORD);
    await page.goto(`/tenant/apply?propertyId=${PROPERTY_ID}`);

    await expect(page).toHaveURL(VERIFICATION_URL);
  });

  test("an unverified tenant cannot reach pay rent", async ({ page }) => {
    test.skip(
      !TENANT_EMAIL || !TENANT_PASSWORD,
      "Set PLAYWRIGHT_UNVERIFIED_TENANT_EMAIL/PASSWORD to run this test.",
    );
    if (TENANT_EMAIL === undefined || TENANT_PASSWORD === undefined) {
      return;
    }

    await signIn(page, "Tenant", TENANT_EMAIL, TENANT_PASSWORD);
    await page.goto("/tenant/payment-plan");

    await expect(page).toHaveURL(VERIFICATION_URL);
  });
});
