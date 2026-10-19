"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AUTH_ROUTES } from "@/constants/auth";
import type { ActionResult } from "@/lib/api/actions/action-result";
import { validateFile } from "@/lib/media/scopes";
import { isUploadCancelled, uploadToCloudinary } from "@/lib/media/upload";
import type { MediaScope, UploadTicket, UploadedAsset } from "@/types/api/media";

export type UploadPhase = "idle" | "preparing" | "uploading" | "done" | "error";

/** Thrown when a ticket request is refused with `KYC_REQUIRED`. */
class KycRedirect extends Error {}

/**
 * Mints a ticket for one file. This is always a server action: the browser
 * cannot attach a Bearer token, so `src/lib/api/client.ts` exposes reads only
 * and every ticket request runs server-side.
 */
export type TicketRequest = (file: File) => Promise<ActionResult<UploadTicket>>;

export interface MediaUpload {
  /** Resolves to the stored asset, or `null` with `error` set. */
  upload: (file: File) => Promise<UploadedAsset | null>;
  /** All-or-nothing: `null` if any file fails, with `error` set. */
  uploadAll: (files: readonly File[]) => Promise<readonly UploadedAsset[] | null>;
  progress: number;
  phase: UploadPhase;
  error: string | null;
  isUploading: boolean;
  reset: () => void;
  cancel: () => void;
}

/**
 * Drives the three-step upload for one storage scope: ask the Vemra API for a
 * presigned ticket, PUT the bytes straight to Cloudinary, hand the caller back
 * the stored asset so it can attach it to an entity.
 *
 * Failures come back as `null` plus an `error` message rather than a throw,
 * matching the `ActionResult` convention used across the app's mutations.
 */
export function useMediaUpload(
  scope: MediaScope,
  requestTicket: TicketRequest,
): MediaUpload {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setProgress(0);
    setPhase("idle");
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  /**
   * One file, reporting progress through `onProgress` so `uploadAll` can
   * fold it into an overall percentage. Throws; the public methods catch.
   */
  const run = useCallback(
    async (
      file: File,
      onProgress: (percent: number) => void,
      signal: AbortSignal,
    ): Promise<UploadedAsset> => {
      const problem = validateFile(scope, file);
      if (problem !== null) {
        throw new Error(problem);
      }

      setPhase("preparing");
      const ticket = await requestTicket(file);
      if (!ticket.ok) {
        if (ticket.kycRequired) {
          router.push(AUTH_ROUTES.signupVerification);
          throw new KycRedirect("kyc_required");
        }
        throw new Error(ticket.message);
      }

      setPhase("uploading");
      return uploadToCloudinary(file, ticket.data, { onProgress, signal });
    },
    [scope, requestTicket, router],
  );

  const settle = useCallback((cause: unknown): null => {
    controllerRef.current = null;

    if (cause instanceof KycRedirect) {
      setPhase("idle");
      setProgress(0);
      setError(null);
      return null;
    }

    if (isUploadCancelled(cause)) {
      setPhase("idle");
      setProgress(0);
      setError(null);
      return null;
    }

    setPhase("error");
    setError(
      cause instanceof Error
        ? cause.message
        : "The upload failed. Please try again.",
    );
    return null;
  }, []);

  const upload = useCallback(
    async (file: File): Promise<UploadedAsset | null> => {
      cancel();
      const controller = new AbortController();
      controllerRef.current = controller;

      setError(null);
      setProgress(0);

      try {
        const asset = await run(file, setProgress, controller.signal);
        controllerRef.current = null;
        setPhase("done");
        setProgress(100);
        return asset;
      } catch (cause) {
        return settle(cause);
      }
    },
    [cancel, run, settle],
  );

  const uploadAll = useCallback(
    async (files: readonly File[]): Promise<readonly UploadedAsset[] | null> => {
      if (files.length === 0) {
        return [];
      }

      cancel();
      const controller = new AbortController();
      controllerRef.current = controller;

      setError(null);
      setProgress(0);

      const assets: UploadedAsset[] = [];

      try {
        for (const [index, file] of files.entries()) {
          const asset = await run(
            file,
            (percent) =>
              setProgress(
                Math.round(((index + percent / 100) / files.length) * 100),
              ),
            controller.signal,
          );
          assets.push(asset);
        }

        controllerRef.current = null;
        setPhase("done");
        setProgress(100);
        return assets;
      } catch (cause) {
        return settle(cause);
      }
    },
    [cancel, run, settle],
  );

  return {
    upload,
    uploadAll,
    progress,
    phase,
    error,
    isUploading: phase === "preparing" || phase === "uploading",
    reset,
    cancel,
  };
}
