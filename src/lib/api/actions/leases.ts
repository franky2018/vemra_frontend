"use server";

import { revalidatePath } from "next/cache";

import { toActionFailure } from "@/lib/api/actions/action-result";
import type { ActionResult } from "@/lib/api/actions/action-result";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { requireKycApproved, requireRole } from "@/lib/api/resources/auth";
import { apiPost } from "@/lib/api/server";
import { isUuid } from "@/lib/validation";

const INVALID_LEASE = "Select the lease you want to act on.";

export async function signLeaseAction(
  leaseId: string,
): Promise<ActionResult<null>> {
  await requireKycApproved("/tenant/lease");

  if (!isUuid(leaseId)) {
    return { ok: false, message: INVALID_LEASE };
  }

  try {
    await requireRole("TENANT");
    await apiPost<unknown>(ENDPOINTS.tenant.signLease(leaseId));
    revalidatePath("/tenant/lease");
    revalidatePath("/tenant");
    return { ok: true, data: null };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function createPaymentPlanAction(
  leaseId: string,
  frequency: string,
  startDate: string,
): Promise<ActionResult<null>> {
  await requireKycApproved("/tenant/payment-plan");

  if (!isUuid(leaseId)) {
    return { ok: false, message: INVALID_LEASE };
  }
  if (frequency.trim() === "") {
    return { ok: false, message: "Choose how often you want to pay." };
  }
  if (Number.isNaN(Date.parse(startDate))) {
    return { ok: false, message: "Choose a valid start date." };
  }

  try {
    await requireRole("TENANT");
    await apiPost<unknown>(ENDPOINTS.tenant.paymentPlan(leaseId), {
      frequency,
      startDate: new Date(startDate).toISOString(),
    });
    revalidatePath("/tenant/payment-plan");
    revalidatePath("/tenant");
    return { ok: true, data: null };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function acceptDepositDecisionAction(
  leaseId: string,
): Promise<ActionResult<null>> {
  await requireKycApproved("/tenant/deposit-decision");

  if (!isUuid(leaseId)) {
    return { ok: false, message: INVALID_LEASE };
  }

  try {
    await requireRole("TENANT");
    await apiPost<unknown>(ENDPOINTS.tenant.acceptDeposit(leaseId));
    revalidatePath("/tenant/deposit-decision");
    revalidatePath("/tenant/caution-deposit");
    return { ok: true, data: null };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function disputeDepositDecisionAction(
  leaseId: string,
  reason: string,
): Promise<ActionResult<null>> {
  await requireKycApproved("/tenant/deposit-decision");

  if (!isUuid(leaseId)) {
    return { ok: false, message: INVALID_LEASE };
  }

  const trimmed = reason.trim();
  if (trimmed === "") {
    return {
      ok: false,
      message: "Tell us why you are disputing this decision.",
      fieldErrors: { reason: "A reason is required." },
    };
  }

  try {
    await requireRole("TENANT");
    await apiPost<unknown>(ENDPOINTS.tenant.disputeDeposit(leaseId), {
      reason: trimmed,
    });
    revalidatePath("/tenant/deposit-decision");
    revalidatePath("/tenant/caution-deposit");
    return { ok: true, data: null };
  } catch (error) {
    return toActionFailure(error);
  }
}
