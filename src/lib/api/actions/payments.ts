"use server";

import { toActionFailure } from "@/lib/api/actions/action-result";
import type { ActionResult } from "@/lib/api/actions/action-result";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { requireKycApproved, requireRole } from "@/lib/api/resources/auth";
import { payInitiationSchema, parseOrThrow } from "@/lib/api/schemas";
import { apiPost } from "@/lib/api/server";
import { unwrapData } from "@/lib/api/adapters";
import { allowedCheckoutUrl } from "@/lib/payments/provider";
import { isUuid } from "@/lib/validation";

export interface PaymentBreakdown {
  rentMinor: number;
  cautionDepositMinor: number;
  tenantPlatformFeeMinor: number;
  paystackFeeMinor: number;
  totalAmountMinor: number;
  currency: string;
}

export interface PaymentInitiation {
  checkoutUrl: string;
  breakdown: PaymentBreakdown;
}

const INVALID_LEASE = "Select the lease you want to pay for.";
const INVALID_KEY = "Could not start this payment attempt. Please try again.";
const UNTRUSTED_CHECKOUT =
  "Vemra returned a checkout link we do not recognise, so the payment was stopped. No money has moved. Please contact support.";

export async function initiateRentPaymentAction(
  leaseId: string,
  idempotencyKey: string,
): Promise<ActionResult<PaymentInitiation>> {
  await requireKycApproved("/tenant/payment-plan");

  if (!isUuid(leaseId)) {
    return { ok: false, message: INVALID_LEASE };
  }
  if (!isUuid(idempotencyKey)) {
    return { ok: false, message: INVALID_KEY };
  }

  try {
    await requireRole("TENANT");

    const body = await apiPost<unknown>(
      ENDPOINTS.tenant.checkout(leaseId),
      undefined,
      { idempotencyKey },
    );

    const parsed = parseOrThrow(
      "payment initiation",
      payInitiationSchema,
      unwrapData<unknown>(body),
    );

    const checkoutUrl = allowedCheckoutUrl(parsed.checkoutUrl);
    if (checkoutUrl === null) {
      console.error(
        "[payments] rejected a checkout URL outside the provider allowlist",
      );
      return { ok: false, message: UNTRUSTED_CHECKOUT };
    }

    return {
      ok: true,
      data: { checkoutUrl, breakdown: parsed.breakdown },
    };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function topUpRentSavingsAction(
  amountMinor: number,
  idempotencyKey: string,
): Promise<ActionResult<{ checkoutUrl: string }>> {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return { ok: false, message: "Enter an amount greater than zero." };
  }
  if (!isUuid(idempotencyKey)) {
    return { ok: false, message: INVALID_KEY };
  }

  try {
    await requireRole("TENANT");

    const body = await apiPost<unknown>(
      ENDPOINTS.tenant.rentSavingsTopUp,
      { amountMinor },
      { idempotencyKey },
    );

    const payload = unwrapData<{ checkoutUrl?: unknown }>(body);
    const checkoutUrl = allowedCheckoutUrl(payload?.checkoutUrl);

    if (checkoutUrl === null) {
      console.error(
        "[payments] rejected a top-up checkout URL outside the provider allowlist",
      );
      return { ok: false, message: UNTRUSTED_CHECKOUT };
    }

    return { ok: true, data: { checkoutUrl } };
  } catch (error) {
    return toActionFailure(error);
  }
}
