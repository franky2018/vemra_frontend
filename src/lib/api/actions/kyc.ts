"use server";

import { revalidatePath } from "next/cache";

import { ACCOUNT_PATHS } from "@/lib/api/actions/account-paths";
import { toActionFailure } from "@/lib/api/actions/action-result";
import type { ActionResult } from "@/lib/api/actions/action-result";
import type { TicketFileInput } from "@/lib/api/actions/media";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { apiPost, apiPostData } from "@/lib/api/server";
import { MEDIA_SCOPES, validateFile } from "@/lib/media/scopes";
import { readUploadTicket } from "@/lib/media/ticket";
import type {
  KycSubmissionPayload,
  KycSubmissionResult,
  NinVerificationInput,
  NinVerificationOutcome,
  NinVerificationResult,
} from "@/types/api/auth";
import type { UploadTicket } from "@/types/api/media";

/**
 * `POST /kyc/documents/grants`.
 *
 * This endpoint predates the other ticket routes and returns `{ url, fields }`
 * rather than `{ uploadUrl, fields, ... }`; `readUploadTicket` normalises both.
 */
export async function createKycUploadGrantAction(
  input: TicketFileInput,
): Promise<ActionResult<UploadTicket>> {
  const problem = validateFile("KYC", {
    name: input.fileName.trim(),
    size: input.sizeBytes,
    type: input.contentType,
  });
  if (problem !== null) {
    return { ok: false, message: problem };
  }

  try {
    const ticket = readUploadTicket(
      await apiPost<unknown>(ENDPOINTS.kyc.documentGrants, {
        fileName: input.fileName.trim(),
        contentType: input.contentType,
        maxSizeBytes: MEDIA_SCOPES.KYC.maxBytes,
      }),
    );

    return ticket === null
      ? { ok: false, message: "Vemra did not return a usable upload ticket." }
      : { ok: true, data: ticket };
  } catch (error) {
    return toActionFailure(error);
  }
}


export async function submitKycAction(
  payload: KycSubmissionPayload,
): Promise<ActionResult<KycSubmissionResult>> {
  try {
    const data = await apiPostData<KycSubmissionResult>(
      ENDPOINTS.kyc.submissions,
      payload,
    );
    for (const path of ACCOUNT_PATHS) {
      revalidatePath(path);
    }
    return { ok: true, data };
  } catch (error) {
    return toActionFailure(error);
  }
}

const NIN_PATTERN = /^\d{11}$/;

const NIN_OUTCOMES: readonly NinVerificationOutcome[] = [
  "approve",
  "failed",
  "pending",
];

/** The spec returns `{ success }`; anything else is rejected as a contract gap. */
function readNinResult(value: unknown): NinVerificationResult | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const success = (value as Record<string, unknown>).success;
  return typeof success === "string" &&
    (NIN_OUTCOMES as readonly string[]).includes(success)
    ? { success: success as NinVerificationOutcome }
    : null;
}

/**
 * `POST /kyc/verify-nin`. Confirms the NIN and name before the documents are
 * submitted, so a mismatch fails fast with a clear message.
 */
export async function verifyNinAction(
  input: NinVerificationInput,
): Promise<ActionResult<NinVerificationResult>> {
  const nin = input.nin.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();

  if (!NIN_PATTERN.test(nin)) {
    return {
      ok: false,
      message: "Enter the 11-digit NIN printed on your identity document.",
      fieldErrors: { nin: "NIN must be exactly 11 digits." },
    };
  }
  if (firstName === "" || lastName === "") {
    return {
      ok: false,
      message:
        "Enter your first and last name exactly as they appear on your identity document.",
    };
  }

  try {
    const result = readNinResult(
      await apiPostData<unknown>(ENDPOINTS.kyc.verifyNin, {
        nin,
        firstName,
        lastName,
        ...(input.dob?.trim() ? { dob: input.dob.trim() } : {}),
        ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
        ...(input.gender?.trim() ? { gender: input.gender.trim() } : {}),
      }),
    );

    return result === null
      ? {
          ok: false,
          message:
            "Vemra returned an unexpected NIN verification response. Try again or contact support.",
        }
      : { ok: true, data: result };
  } catch (error) {
    return toActionFailure(error);
  }
}
