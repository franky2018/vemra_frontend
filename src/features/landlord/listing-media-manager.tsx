"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { MediaPreview } from "@/components/media/media-preview";
import { Button } from "@/components/ui/button";
import { AUTH_ROUTES } from "@/constants/auth";
import {
  attachMediaAction,
  createMediaTicketAction,
  deleteMediaAction,
  updateMediaAction,
} from "@/lib/api/actions/properties";
import {
  acceptAttribute,
  describeLimits,
  validateFiles,
} from "@/lib/media/scopes";
import { useMediaUpload } from "@/lib/media/use-media-upload";
import type { PropertyPhoto } from "@/types/api/landlord";

const panel = "rounded-lg border border-neutral-200 bg-white p-4 md:p-6";

export interface ListingMediaManagerProps {
  propertyId: string;
  photos: readonly PropertyPhoto[];
}

/**
 * Landlord media manager for an existing listing: add photos or videos, choose
 * the cover, reorder, and remove.
 *
 * Photos carry a media id only when the backend includes one. Without it a
 * photo cannot be patched or deleted, so those controls are disabled and the
 * manager stays read-only rather than sending requests that cannot succeed.
 */
export function ListingMediaManager({
  propertyId,
  photos,
}: ListingMediaManagerProps) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requestTicket = useCallback(
    (file: File) =>
      createMediaTicketAction(propertyId, {
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      }),
    [propertyId],
  );
  const upload = useMediaUpload("PROPERTY_MEDIA", requestTicket);

  const isBusy = busy !== null || upload.isUploading;
  const problem = error ?? upload.error;

  const run = async (
    key: string,
    action: () => Promise<
      { ok: true } | { ok: false; message: string; kycRequired?: true }
    >,
    success: string,
  ) => {
    setBusy(key);
    setError(null);
    setNotice(null);

    const result = await action();
    setBusy(null);

    if (!result.ok) {
      if (result.kycRequired) {
        router.push(AUTH_ROUTES.signupVerification);
        return;
      }
      setError(result.message);
      return;
    }

    setNotice(success);
    router.refresh();
  };

  const addPhotos = async (files: readonly File[]) => {
    const invalid = validateFiles("PROPERTY_MEDIA", files);
    if (invalid !== null) {
      setError(invalid);
      setNotice(null);
      return;
    }

    setBusy("add");
    setError(null);
    setNotice(null);
    upload.reset();

    const assets = await upload.uploadAll(files);
    if (assets === null) {
      setBusy(null);
      return;
    }

    const failures: string[] = [];
    // Orders can be sparse after a delete (the backend does not renumber), so
    // append past the highest existing order rather than at `photos.length`.
    let order =
      photos.reduce((highest, photo) => Math.max(highest, photo.order), -1) + 1;
    let isFirst = photos.length === 0;

    for (const asset of assets) {
      const attached = await attachMediaAction(
        propertyId,
        asset.url,
        isFirst,
        order,
      );
      if (!attached.ok) {
        if (attached.kycRequired) {
          router.push(AUTH_ROUTES.signupVerification);
          return;
        }
        failures.push(attached.message);
      }
      isFirst = false;
      order += 1;
    }

    if (inputRef.current !== null) {
      inputRef.current.value = "";
    }
    setBusy(null);

    if (failures.length > 0) {
      setError(failures[0]);
    } else {
      setNotice(
        `Added ${assets.length} item${assets.length === 1 ? "" : "s"}.`,
      );
    }
    router.refresh();
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    const photo = photos[index];
    const neighbour = photos[target];
    if (photo === undefined || neighbour === undefined) {
      return;
    }
    if (photo.id === null || neighbour.id === null) {
      return;
    }

    void run(
      `move:${photo.id}`,
      async () => {
        const first = await updateMediaAction(propertyId, photo.id as string, {
          order: neighbour.order,
        });
        if (!first.ok) {
          return first;
        }
        return updateMediaAction(propertyId, neighbour.id as string, {
          order: photo.order,
        });
      },
      "Order updated.",
    );
  };

  return (
    <section aria-labelledby={`${inputId}-heading`} className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id={`${inputId}-heading`}
            className="font-display text-heading-sm font-semibold text-neutral-900"
          >
            Listing photos &amp; videos
          </h2>
          <p className="mt-1 text-label-sm text-neutral-700">
            The first item is the cover shown in search results.{" "}
            {describeLimits("PROPERTY_MEDIA")} each.
          </p>
        </div>

        <Button
          size="sm"
          variant="secondary"
          disabled={isBusy}
          isLoading={upload.isUploading}
          onClick={() => inputRef.current?.click()}
        >
          Add photos or videos
        </Button>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={acceptAttribute("PROPERTY_MEDIA")}
        multiple
        className="sr-only"
        disabled={isBusy}
        onChange={(event) => {
          const selected = [...(event.target.files ?? [])];
          if (selected.length > 0) {
            void addPhotos(selected);
          }
        }}
      />

      {photos.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 text-body-sm text-neutral-700">
          No photos or videos yet. Add at least one so renters can see the
          property.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo, index) => {
            const isMain = photo.isMain || index === 0;
            const canManage = photo.id !== null;

            return (
              <li
                key={photo.id ?? photo.url}
                className="flex flex-col overflow-hidden rounded-md border border-neutral-200"
              >
                <div className="relative">
                  <MediaPreview
                    url={photo.url}
                    alt={photo.alt || `Listing media ${index + 1}`}
                    width={200}
                    height={140}
                    sizes="(max-width: 640px) 50vw, 200px"
                    controls
                    className="h-28 w-full bg-neutral-900 object-cover"
                  />
                  {isMain ? (
                    <span className="absolute left-2 top-2 rounded-full bg-brand-700 px-2 py-0.5 text-caption font-semibold text-white">
                      Cover
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 p-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isBusy || !canManage || index === 0}
                      onClick={() => move(index, -1)}
                      className="rounded-sm px-2 py-1 text-label-sm font-semibold text-neutral-800 disabled:opacity-45"
                    >
                      ↑
                      <span className="sr-only">Move item {index + 1} up</span>
                    </button>
                    <button
                      type="button"
                      disabled={
                        isBusy || !canManage || index === photos.length - 1
                      }
                      onClick={() => move(index, 1)}
                      className="rounded-sm px-2 py-1 text-label-sm font-semibold text-neutral-800 disabled:opacity-45"
                    >
                      ↓
                      <span className="sr-only">
                        Move item {index + 1} down
                      </span>
                    </button>
                  </div>

                  {isMain ? null : (
                    <button
                      type="button"
                      disabled={isBusy || !canManage}
                      onClick={() => {
                        if (photo.id === null) {
                          return;
                        }
                        void run(
                          `cover:${photo.id}`,
                          () =>
                            updateMediaAction(propertyId, photo.id as string, {
                              isMain: true,
                            }),
                          "Cover updated.",
                        );
                      }}
                      className="self-start text-label-sm font-semibold text-brand-700 disabled:opacity-45"
                    >
                      Set as cover
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isBusy || !canManage}
                    onClick={() => {
                      if (photo.id === null) {
                        return;
                      }
                      void run(
                        `remove:${photo.id}`,
                        () => deleteMediaAction(propertyId, photo.id as string),
                        "Item removed.",
                      );
                    }}
                    className="self-start text-label-sm font-semibold text-error-600 disabled:opacity-45"
                  >
                    Remove
                  </button>

                  {canManage ? null : (
                    <p className="text-caption text-neutral-700">
                      Read-only
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {photos.some((photo) => photo.id === null) ? (
        <p className="mt-3 text-label-sm text-neutral-700">
          Some items cannot be reordered or removed because Vemra did not
          return a media id for them.
        </p>
      ) : null}

      <p aria-live="polite" className="mt-3 min-h-5 text-label-sm">
        {problem !== null ? (
          <span role="alert" className="text-error-600">
            {problem}
          </span>
        ) : upload.isUploading ? (
          <span className="text-brand-700">Uploading {upload.progress}%</span>
        ) : busy !== null ? (
          <span className="text-neutral-700">Saving…</span>
        ) : notice !== null ? (
          <span className="text-success-600">{notice}</span>
        ) : null}
      </p>
    </section>
  );
}
