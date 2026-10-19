"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AUTH_ROUTES } from "@/constants/auth";
import {
  addMaintenanceMediaAction,
  reportMaintenanceAction,
} from "@/lib/api/actions/maintenance";
import type { MaintenancePriority } from "@/lib/api/actions/maintenance";
import { createMaintenanceTicketAction } from "@/lib/api/actions/media";
import {
  acceptAttribute,
  describeLimits,
  validateFiles,
} from "@/lib/media/scopes";
import { useMediaUpload } from "@/lib/media/use-media-upload";

const PRIORITIES: readonly { value: MaintenancePriority; label: string }[] = [
  { value: "LOW", label: "Low — can wait" },
  { value: "MEDIUM", label: "Medium — needs attention" },
  { value: "HIGH", label: "High — affecting daily use" },
  { value: "EMERGENCY", label: "Emergency — unsafe or urgent" },
];

export interface MaintenancePropertyOption {
  propertyId: string;
  label: string;
}

export interface MaintenanceReportFormProps {
  properties: readonly MaintenancePropertyOption[];
}

export function MaintenanceReportForm({
  properties,
}: MaintenanceReportFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [propertyId, setPropertyId] = useState(
    properties[0]?.propertyId ?? "",
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<MaintenancePriority>("MEDIUM");
  const [photos, setPhotos] = useState<File[]>([]);
  const [stage, setStage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  // Maintenance tickets are scoped to a property, so the ticket request is
  // rebuilt whenever the selected property changes.
  const requestTicket = useCallback(
    (file: File) =>
      createMaintenanceTicketAction(propertyId, {
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      }),
    [propertyId],
  );
  const upload = useMediaUpload("MAINTENANCE", requestTicket);

  const isBusy = isSubmitting || upload.isUploading;
  const problem = error ?? upload.error;

  if (properties.length === 0) {
    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-5 md:p-6">
        <h2 className="text-body-md font-semibold text-neutral-900">
          Report an issue
        </h2>
        <p className="mt-2 text-body-sm text-neutral-700">
          Reporting opens once you have an active rental on your account.
        </p>
      </section>
    );
  }

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setPhotos([]);
    if (inputRef.current !== null) {
      inputRef.current.value = "";
    }
    upload.reset();
  };

  const submit = async () => {
    setError(null);
    setFieldErrors({});
    setDone(false);
    upload.reset();
    setIsSubmitting(true);

    setStage("Recording the issue…");
    const reported = await reportMaintenanceAction({
      propertyId,
      title,
      description,
      priority,
    });

    if (!reported.ok) {
      if (reported.kycRequired) {
        router.push(AUTH_ROUTES.signupVerification);
        setStage(null);
        setIsSubmitting(false);
        return;
      }
      setError(reported.message);
      setFieldErrors({ ...(reported.fieldErrors ?? {}) });
      setStage(null);
      setIsSubmitting(false);
      return;
    }

    // The issue is already filed at this point. A photo failure from here on is
    // reported as a partial success, not a failed report.
    if (photos.length > 0) {
      setStage(`Uploading ${photos.length} photo${photos.length === 1 ? "" : "s"}…`);
      const assets = await upload.uploadAll(photos);

      if (assets === null) {
        setError(
          `The issue was reported, but its photos could not be uploaded: ${
            upload.error ?? "the upload failed"
          }`,
        );
        setStage(null);
        setIsSubmitting(false);
        router.refresh();
        return;
      }

      setStage("Attaching photos…");
      const attached = await addMaintenanceMediaAction(
        reported.data.issueId,
        assets.map((asset) => asset.url),
      );

      if (!attached.ok) {
        if (attached.kycRequired) {
          router.push(AUTH_ROUTES.signupVerification);
          setStage(null);
          setIsSubmitting(false);
          return;
        }
        setError(
          `The issue was reported, but its photos could not be attached: ${attached.message}`,
        );
        setStage(null);
        setIsSubmitting(false);
        router.refresh();
        return;
      }
    }

    setStage(null);
    setIsSubmitting(false);
    setDone(true);
    reset();
    router.refresh();
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-5 md:p-6">
      <div>
        <h2 className="text-body-md font-semibold text-neutral-900">
          Report an issue
        </h2>
        <p className="mt-1 text-label-sm text-neutral-700">
          Photos and videos help your Property Admin triage the problem faster.
        </p>
      </div>

      {properties.length > 1 ? (
        <label className="flex flex-col gap-1.5 text-label-md font-semibold text-neutral-800">
          Property
          <select
            value={propertyId}
            disabled={isBusy}
            onChange={(event) => setPropertyId(event.target.value)}
            className="h-11 rounded-md border border-neutral-200 bg-white px-3 text-body-md font-normal outline-none focus:border-brand-700 disabled:cursor-not-allowed disabled:bg-neutral-50"
          >
            {properties.map((option) => (
              <option key={option.propertyId} value={option.propertyId}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <Input
        label="What is wrong?"
        name="title"
        value={title}
        disabled={isBusy}
        error={fieldErrors.title}
        placeholder="Kitchen tap is leaking"
        onChange={(event) => setTitle(event.target.value)}
      />

      <Textarea
        label="Describe the issue"
        name="description"
        value={description}
        disabled={isBusy}
        error={fieldErrors.description}
        fieldClassName="min-h-24"
        placeholder="Where it is, when it started, and anything you have already tried."
        onChange={(event) => setDescription(event.target.value)}
      />

      <label className="flex flex-col gap-1.5 text-label-md font-semibold text-neutral-800">
        Priority
        <select
          value={priority}
          disabled={isBusy}
          onChange={(event) =>
            setPriority(event.target.value as MaintenancePriority)
          }
          className="h-11 rounded-md border border-neutral-200 bg-white px-3 text-body-md font-normal outline-none focus:border-brand-700 disabled:cursor-not-allowed disabled:bg-neutral-50"
        >
          {PRIORITIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-2">
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center">
          <span className="text-label-md font-semibold text-neutral-900">
            {photos.length === 0
              ? "Add photos or videos (optional)"
              : `${photos.length} item${photos.length === 1 ? "" : "s"} selected`}
          </span>
          <span className="text-label-sm text-neutral-700">
            {describeLimits("MAINTENANCE")} each
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={acceptAttribute("MAINTENANCE")}
            multiple
            disabled={isBusy}
            className="sr-only"
            onChange={(event) => {
              const selected = [...(event.target.files ?? [])];
              const invalid = validateFiles("MAINTENANCE", selected);

              if (invalid !== null) {
                setError(invalid);
                setPhotos([]);
                event.target.value = "";
                return;
              }

              setError(null);
              setPhotos(selected);
            }}
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          isLoading={isBusy}
          disabled={isBusy}
          onClick={submit}
        >
          Report issue
        </Button>

        <p aria-live="polite" className="min-h-5 text-label-sm">
          {problem !== null ? (
            <span role="alert" className="text-error-600">
              {problem}
            </span>
          ) : stage !== null ? (
            <span className="text-neutral-700">
              {stage}
              {upload.isUploading ? ` ${upload.progress}%` : ""}
            </span>
          ) : done ? (
            <span className="text-success-600">
              Reported. Vemra will follow up.
            </span>
          ) : null}
        </p>
      </div>
    </section>
  );
}
