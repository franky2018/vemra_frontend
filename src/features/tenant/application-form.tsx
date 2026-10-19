"use client";

import { useCallback, useId, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { APPLICATION_DOCUMENT_TYPES } from "@/constants/applications";
import { AUTH_ROUTES } from "@/constants/auth";
import { submitApplicationAction } from "@/lib/api/actions/applications";
import { createApplicationDocumentTicketAction } from "@/lib/api/actions/media";
import { acceptAttribute, describeLimits, validateFile } from "@/lib/media/scopes";
import { useMediaUpload } from "@/lib/media/use-media-upload";
import { cn } from "@/lib/cn";

interface DocumentRow {
  key: string;
  documentType: string;
  file: File | null;
}

function newRow(index: number): DocumentRow {
  return {
    key: `document-${index}`,
    documentType: APPLICATION_DOCUMENT_TYPES[0].value,
    file: null,
  };
}

export interface ApplicationFormProps {
  propertyId: string;
  propertyTitle: string | null;
}

/**
 * Submits a rental application with its supporting documents.
 *
 * Each document is sent as the file's type, its uploaded URL and the time it
 * landed, which is the shape `POST /applications` validates.
 */
export function ApplicationForm({
  propertyId,
  propertyTitle,
}: ApplicationFormProps) {
  const router = useRouter();
  const groupId = useId();
  const [rows, setRows] = useState<readonly DocumentRow[]>([newRow(0)]);
  const [nextKey, setNextKey] = useState(1);
  const [stage, setStage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const requestTicket = useCallback(
    (file: File) =>
      createApplicationDocumentTicketAction({
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      }),
    [],
  );
  const upload = useMediaUpload("APPLICATIONS", requestTicket);

  const isBusy = isSubmitting || upload.isUploading;
  const problem = error ?? upload.error;
  const attached = rows.filter(
    (row): row is DocumentRow & { file: File } => row.file !== null,
  );

  const updateRow = (key: string, change: Partial<DocumentRow>) => {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  };

  const submit = async () => {
    setError(null);
    setSubmitted(null);
    upload.reset();

    if (attached.length === 0) {
      setError("Attach at least one supporting document to apply.");
      return;
    }

    setIsSubmitting(true);
    setStage(
      `Uploading ${attached.length} document${attached.length === 1 ? "" : "s"}…`,
    );

    const assets = await upload.uploadAll(attached.map((row) => row.file));

    if (assets === null) {
      setStage(null);
      setIsSubmitting(false);
      return;
    }

    setStage("Submitting your application…");
    const result = await submitApplicationAction({
      propertyId,
      documents: attached.map((row, index) => ({
        type: row.documentType,
        url: assets[index]?.url ?? "",
        uploadedAt: assets[index]?.uploadedAt ?? new Date().toISOString(),
      })),
    });

    setStage(null);
    setIsSubmitting(false);

    if (!result.ok) {
      if (result.kycRequired) {
        router.push(AUTH_ROUTES.signupVerification);
        return;
      }
      setError(result.message);
      return;
    }

    setSubmitted(result.data.status);
    setRows([newRow(nextKey)]);
    setNextKey((key) => key + 1);
    router.refresh();
  };

  if (submitted !== null) {
    return (
      <section className="rounded-lg border border-success-600 bg-success-50 p-5 md:p-6">
        <h2 className="text-body-md font-semibold text-neutral-900">
          Application submitted
        </h2>
        <p className="mt-2 text-body-sm text-neutral-800">
          Vemra is reviewing your application
          {propertyTitle === null ? "" : ` for ${propertyTitle}`}. The decision
          and its status appear below.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-5 md:p-6">
      <div>
        <h2 className="text-body-md font-semibold text-neutral-900">
          Apply{propertyTitle === null ? "" : ` for ${propertyTitle}`}
        </h2>
        <p className="mt-1 text-label-sm text-neutral-700">
          Attach proof of income or employment. Your documents are stored
          privately and are only visible to Vemra reviewers.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const inputId = `${groupId}-${row.key}`;
          const invalid =
            row.file === null ? null : validateFile("APPLICATIONS", row.file);

          return (
            <div
              key={row.key}
              className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor={inputId}
                  className="text-label-md font-semibold text-neutral-800"
                >
                  Document {index + 1}
                </label>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      setRows((current) =>
                        current.filter((entry) => entry.key !== row.key),
                      )
                    }
                    className="text-label-sm font-semibold text-error-600 disabled:opacity-45"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <select
                value={row.documentType}
                disabled={isBusy}
                aria-label={`Type of document ${index + 1}`}
                onChange={(event) =>
                  updateRow(row.key, { documentType: event.target.value })
                }
                className="h-11 rounded-md border border-neutral-200 bg-white px-3 text-body-md outline-none focus:border-brand-700 disabled:cursor-not-allowed disabled:bg-neutral-50"
              >
                {APPLICATION_DOCUMENT_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                id={inputId}
                type="file"
                accept={acceptAttribute("APPLICATIONS")}
                disabled={isBusy}
                onChange={(event) =>
                  updateRow(row.key, {
                    file: event.target.files?.[0] ?? null,
                  })
                }
                className={cn(
                  "w-full rounded-md border border-neutral-200 bg-white p-2 text-body-sm text-neutral-800",
                  "file:mr-3 file:rounded-sm file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-label-sm file:font-semibold file:text-neutral-900",
                  "focus:border-brand-700 focus:outline-1 focus:outline-brand-700 disabled:cursor-not-allowed disabled:bg-neutral-50",
                )}
              />

              <p
                className={cn(
                  "text-label-sm",
                  invalid === null ? "text-neutral-700" : "text-error-600",
                )}
                {...(invalid === null ? {} : { role: "alert" })}
              >
                {invalid ?? row.file?.name ?? describeLimits("APPLICATIONS")}
              </p>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={isBusy}
        onClick={() => {
          setRows((current) => [...current, newRow(nextKey)]);
          setNextKey((key) => key + 1);
        }}
        className="self-start text-label-md font-semibold text-brand-700 disabled:opacity-45"
      >
        Add another document
      </button>

      <div className="flex items-center gap-3">
        <Button size="sm" isLoading={isBusy} disabled={isBusy} onClick={submit}>
          Submit application
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
          ) : null}
        </p>
      </div>
    </section>
  );
}
