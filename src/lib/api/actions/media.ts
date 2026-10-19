"use server";

import { toActionFailure } from "@/lib/api/actions/action-result";
import type { ActionResult } from "@/lib/api/actions/action-result";
import { ENDPOINTS } from "@/lib/api/endpoints";
import {
  requireKycApproved,
  requireRole,
  requireSession,
} from "@/lib/api/resources/auth";
import { apiPost } from "@/lib/api/server";
import { maxBytesFor, validateFile } from "@/lib/media/scopes";
import { readUploadTicket } from "@/lib/media/ticket";
import { isUuid } from "@/lib/validation";
import type { MediaScope, UploadTicket } from "@/types/api/media";

const NO_TICKET = "Vemra did not return a usable upload ticket.";

/**
 * File metadata a ticket is minted for. Only the metadata crosses the server
 * action boundary — the bytes go straight from the browser to Cloudinary, which
 * is the whole point of the presigned-ticket flow.
 */
export interface TicketFileInput {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Re-checks the scope's limits server-side. The client checks them too for a
 * fast error, but that check is bypassable, and not every scope has a size cap
 * in the backend's own schema.
 */
function validateTicketInput(
  scope: MediaScope,
  input: TicketFileInput,
): string | null {
  const fileName = input.fileName.trim();
  if (fileName === "") {
    return "That file has no name, so it could not be uploaded.";
  }

  // `validateFile` reads name, size and type structurally, so file metadata
  // sent by the browser can be checked with the same rules.
  return validateFile(scope, {
    name: fileName,
    size: input.sizeBytes,
    type: input.contentType,
  });
}

async function mintTicket(
  scope: MediaScope,
  path: string,
  input: TicketFileInput,
  body: Record<string, unknown>,
): Promise<ActionResult<UploadTicket>> {
  const problem = validateTicketInput(scope, input);
  if (problem !== null) {
    return { ok: false, message: problem };
  }

  try {
    const ticket = readUploadTicket(await apiPost<unknown>(path, body));
    return ticket === null
      ? { ok: false, message: NO_TICKET }
      : { ok: true, data: ticket };
  } catch (error) {
    return toActionFailure(error);
  }
}

/**
 * `POST /me/avatar/ticket`.
 *
 * This endpoint names the size field `sizeBytes`; every other ticket endpoint
 * calls it `maxSizeBytes`.
 */
export async function createAvatarTicketAction(
  input: TicketFileInput,
): Promise<ActionResult<UploadTicket>> {
  await requireSession();

  return mintTicket("AVATARS", ENDPOINTS.identity.avatarTicket, input, {
    fileName: input.fileName.trim(),
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  });
}

/** `POST /applications/documents/ticket` — private delivery scope. */
export async function createApplicationDocumentTicketAction(
  input: TicketFileInput,
): Promise<ActionResult<UploadTicket>> {
  await requireRole("TENANT");
  await requireKycApproved("/tenant/apply");

  return mintTicket(
    "APPLICATIONS",
    ENDPOINTS.tenant.applicationDocumentTicket,
    input,
    {
      fileName: input.fileName.trim(),
      contentType: input.contentType,
      maxSizeBytes: maxBytesFor("APPLICATIONS", input.contentType),
    },
  );
}

/** `POST /maintenance/ticket`. Serves tenants and landlords alike. */
export async function createMaintenanceTicketAction(
  propertyId: string,
  input: TicketFileInput,
): Promise<ActionResult<UploadTicket>> {
  await requireSession();

  if (!isUuid(propertyId)) {
    return { ok: false, message: "That property could not be found." };
  }

  return mintTicket("MAINTENANCE", ENDPOINTS.tenant.maintenanceTicket, input, {
    propertyId,
    fileName: input.fileName.trim(),
    contentType: input.contentType,
    maxSizeBytes: maxBytesFor("MAINTENANCE", input.contentType),
  });
}
