"use server";

import { revalidatePath } from "next/cache";

import { toActionFailure } from "@/lib/api/actions/action-result";
import type { ActionResult } from "@/lib/api/actions/action-result";
import { unwrapData } from "@/lib/api/adapters";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { requireKycApproved, requireRole } from "@/lib/api/resources/auth";
import { apiPost } from "@/lib/api/server";
import { isUuid } from "@/lib/validation";

export interface ApplicationDocumentInput {
  /** Document kind the backend recognises, e.g. `PAYSLIP`. */
  type: string;
  /** URL of the uploaded file. */
  url: string;
  /** ISO timestamp of when the file finished uploading. */
  uploadedAt: string;
}

export interface ApplicationSubmission {
  propertyId: string;
  documents: readonly ApplicationDocumentInput[];
}

/** `POST /applications` — submits a rental application with its documents. */
export async function submitApplicationAction(
  submission: ApplicationSubmission,
): Promise<ActionResult<{ applicationId: string; status: string }>> {
  await requireRole("TENANT");

  if (!isUuid(submission.propertyId)) {
    return { ok: false, message: "That property could not be found." };
  }

  await requireKycApproved(
    `/tenant/apply?propertyId=${submission.propertyId}`,
  );

  const documents = submission.documents
    .map((document) => ({
      type: document.type.trim(),
      url: document.url.trim(),
      uploadedAt: document.uploadedAt,
    }))
    .filter((document) => document.type !== "" && document.url !== "");

  if (documents.length !== submission.documents.length) {
    return {
      ok: false,
      message: "One of those documents is missing a type or a stored file.",
    };
  }

  try {
    const body = await apiPost<unknown>(ENDPOINTS.tenant.applications, {
      propertyId: submission.propertyId,
      documents,
    });
    const payload = unwrapData<{ id?: unknown; status?: unknown }>(body);

    revalidatePath("/tenant/apply");
    revalidatePath("/tenant/applications");

    if (typeof payload?.id !== "string" || payload.id === "") {
      return {
        ok: false,
        message:
          "Vemra received the application but did not return its id. Check your applications list before submitting again.",
      };
    }

    return {
      ok: true,
      data: {
        applicationId: payload.id,
        status:
          typeof payload.status === "string" ? payload.status : "SUBMITTED",
      },
    };
  } catch (error) {
    return toActionFailure(error);
  }
}
