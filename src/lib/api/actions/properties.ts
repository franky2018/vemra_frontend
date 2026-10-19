"use server";

import { revalidatePath } from "next/cache";

import { toActionFailure } from "@/lib/api/actions/action-result";
import type { ActionResult } from "@/lib/api/actions/action-result";
import type { TicketFileInput } from "@/lib/api/actions/media";
import { unwrapData } from "@/lib/api/adapters";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { requireKycApproved, requireRole } from "@/lib/api/resources/auth";
import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import { isAllowedDeliveryUrl } from "@/lib/media/cloudinary";
import { maxBytesFor, validateFile } from "@/lib/media/scopes";
import { readUploadTicket } from "@/lib/media/ticket";
import { isUuid } from "@/lib/validation";
import type { UploadTicket } from "@/types/api/media";

const INVALID_PROPERTY = "That property could not be found.";
const INVALID_MEDIA = "That photo could not be found.";

export interface PropertyDraft {
  title: string;
  description: string;
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  amenities: readonly string[];
  rentAmountMinor: number;
  rentCurrency: string;
  rentPeriod: "monthly" | "yearly";
  location: {
    address: string;
    city: string;
    state: string;
    country: string;
  };
}

export interface PropertyUpdate {
  title?: string;
  description?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  amenities?: readonly string[];
  rentAmountMinor?: number;
  rentCurrency?: string;
  rentPeriod?: "monthly" | "yearly";
}

export interface MediaUpdate {
  isMain?: boolean;
  order?: number;
}

export async function createPropertyAction(
  draft: PropertyDraft,
): Promise<ActionResult<{ propertyId: string }>> {
  await requireKycApproved("/landlord/properties/new");

  try {
    await requireRole("LANDLORD");

    const body = await apiPost<unknown>(
      ENDPOINTS.landlord.createProperty,
      draft,
    );
    const payload = unwrapData<{ id?: unknown; propertyId?: unknown }>(body);
    const id = payload?.id ?? payload?.propertyId;

    if (typeof id !== "string" || id === "") {
      return {
        ok: false,
        message:
          "Vemra created the listing but did not return its id, so we could not continue. Check your listings.",
      };
    }

    revalidatePath("/landlord/properties");
    return { ok: true, data: { propertyId: id } };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function updatePropertyAction(
  propertyId: string,
  update: PropertyUpdate,
): Promise<ActionResult<null>> {
  await requireKycApproved(`/landlord/properties/${propertyId}`);

  if (!isUuid(propertyId)) {
    return { ok: false, message: INVALID_PROPERTY };
  }

  try {
    await requireRole("LANDLORD");
    await apiPatch<unknown>(
      ENDPOINTS.landlord.updateProperty(propertyId),
      update,
    );
    revalidatePath("/landlord/properties");
    revalidatePath(`/landlord/properties/${propertyId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function createMediaTicketAction(
  propertyId: string,
  input: TicketFileInput,
): Promise<ActionResult<UploadTicket>> {
  await requireKycApproved(`/landlord/properties/${propertyId}`);

  if (!isUuid(propertyId)) {
    return { ok: false, message: INVALID_PROPERTY };
  }

  const problem = validateFile("PROPERTY_MEDIA", {
    name: input.fileName.trim(),
    size: input.sizeBytes,
    type: input.contentType,
  });
  if (problem !== null) {
    return { ok: false, message: problem };
  }

  try {
    await requireRole("LANDLORD");
    const ticket = readUploadTicket(
      await apiPost<unknown>(ENDPOINTS.landlord.mediaTicket(propertyId), {
        fileName: input.fileName.trim(),
        contentType: input.contentType,
        maxSizeBytes: maxBytesFor("PROPERTY_MEDIA", input.contentType),
      }),
    );

    return ticket === null
      ? { ok: false, message: "Vemra did not return a usable upload ticket." }
      : { ok: true, data: ticket };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function attachMediaAction(
  propertyId: string,
  url: string,
  isMain: boolean,
  order: number,
): Promise<ActionResult<null>> {
  await requireKycApproved(`/landlord/properties/${propertyId}`);

  if (!isUuid(propertyId)) {
    return { ok: false, message: INVALID_PROPERTY };
  }
  if (!isAllowedDeliveryUrl(url)) {
    return {
      ok: false,
      message: "That photo address is not a Vemra storage URL.",
    };
  }

  try {
    await requireRole("LANDLORD");
    await apiPost<unknown>(ENDPOINTS.landlord.media(propertyId), {
      url,
      isMain,
      order,
    });
    revalidatePath(`/landlord/properties/${propertyId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionFailure(error);
  }
}

/** `PATCH /properties/:propertyId/media/:mediaId` — set the cover or reorder. */
export async function updateMediaAction(
  propertyId: string,
  mediaId: string,
  update: MediaUpdate,
): Promise<ActionResult<null>> {
  await requireKycApproved(`/landlord/properties/${propertyId}`);

  if (!isUuid(propertyId)) {
    return { ok: false, message: INVALID_PROPERTY };
  }
  if (mediaId.trim() === "") {
    return { ok: false, message: INVALID_MEDIA };
  }
  if (update.isMain === undefined && update.order === undefined) {
    return { ok: false, message: "There was nothing to change on that photo." };
  }

  try {
    await requireRole("LANDLORD");
    await apiPatch<unknown>(
      ENDPOINTS.landlord.mediaItem(propertyId, mediaId),
      update,
    );
    revalidatePath("/landlord/properties");
    revalidatePath(`/landlord/properties/${propertyId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionFailure(error);
  }
}

/**
 * `DELETE /properties/:propertyId/media/:mediaId`. Detaches the photo from the
 * listing and destroys the Cloudinary asset behind it.
 */
export async function deleteMediaAction(
  propertyId: string,
  mediaId: string,
): Promise<ActionResult<null>> {
  await requireKycApproved(`/landlord/properties/${propertyId}`);

  if (!isUuid(propertyId)) {
    return { ok: false, message: INVALID_PROPERTY };
  }
  if (mediaId.trim() === "") {
    return { ok: false, message: INVALID_MEDIA };
  }

  try {
    await requireRole("LANDLORD");
    await apiDelete<unknown>(ENDPOINTS.landlord.mediaItem(propertyId, mediaId));
    revalidatePath("/landlord/properties");
    revalidatePath(`/landlord/properties/${propertyId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function publishPropertyAction(
  propertyId: string,
): Promise<ActionResult<null>> {
  await requireKycApproved(`/landlord/properties/${propertyId}`);

  if (!isUuid(propertyId)) {
    return { ok: false, message: INVALID_PROPERTY };
  }

  try {
    await requireRole("LANDLORD");
    await apiPost<unknown>(ENDPOINTS.landlord.publishProperty(propertyId));
    revalidatePath("/landlord/properties");
    revalidatePath(`/landlord/properties/${propertyId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function unlistPropertyAction(
  propertyId: string,
): Promise<ActionResult<null>> {
  if (!isUuid(propertyId)) {
    return { ok: false, message: INVALID_PROPERTY };
  }

  try {
    await requireRole("LANDLORD");
    await apiPost<unknown>(ENDPOINTS.landlord.unlistProperty(propertyId));
    revalidatePath("/landlord/properties");
    revalidatePath(`/landlord/properties/${propertyId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function saveProperty(
  propertyId: string,
): Promise<ActionResult<null>> {
  if (!isUuid(propertyId)) {
    return { ok: false, message: INVALID_PROPERTY };
  }

  try {
    await requireRole("TENANT");
    await apiPost<unknown>(ENDPOINTS.tenant.savedProperties, { propertyId });
    revalidatePath("/tenant/saved-properties");
    return { ok: true, data: null };
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function unsaveProperty(
  propertyId: string,
): Promise<ActionResult<null>> {
  if (!isUuid(propertyId)) {
    return { ok: false, message: INVALID_PROPERTY };
  }

  try {
    await requireRole("TENANT");
    await apiDelete<unknown>(ENDPOINTS.tenant.savedProperty(propertyId));
    revalidatePath("/tenant/saved-properties");
    return { ok: true, data: null };
  } catch (error) {
    return toActionFailure(error);
  }
}
