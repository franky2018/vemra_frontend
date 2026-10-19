"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useId, useState } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createKycUploadGrantAction,
  submitKycAction,
  verifyNinAction,
} from "@/lib/api/actions/kyc";
import { AuthCard } from "@/features/auth/auth-card";
import { KYC_CHECKS } from "@/features/auth/verification-steps";
import { acceptAttribute, describeLimits } from "@/lib/media/scopes";
import { useMediaUpload } from "@/lib/media/use-media-upload";
import { cn } from "@/lib/cn";
import type { AccountProfile, KycDocumentInput } from "@/types/api/auth";

type Phase = "idle" | "verifying" | "uploading" | "submitting" | "done";

export interface KycUploadFormProps {
  account: AccountProfile;
  className?: string;
  skipHref: string;
}

export function KycUploadForm({ account, className, skipHref }: KycUploadFormProps) {
  const router = useRouter();
  const groupId = useId();
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nin, setNin] = useState("");
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const requestTicket = useCallback(
    (file: File) =>
      createKycUploadGrantAction({
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      }),
    [],
  );
  const upload = useMediaUpload("KYC", requestTicket);

  const isBusy =
    phase === "verifying" || phase === "uploading" || phase === "submitting";
  const hasRequiredFile = files.IDENTITY !== undefined && files.IDENTITY !== null;
  const problem = error ?? upload.error;

  const setFile = (checkType: string, file: File | null) => {
    setFiles((current) => ({ ...current, [checkType]: file }));
  };

  const handleSubmit = async () => {
    setError(null);
    upload.reset();

    const selected = KYC_CHECKS.map((check) => ({
      checkType: check.checkType,
      file: files[check.checkType] ?? null,
    })).filter(
      (entry): entry is { checkType: string; file: File } => entry.file !== null,
    );

    if (selected.length === 0) {
      setError("Attach at least your identity document to continue.");
      return;
    }

    if (
      firstName.trim() === "" ||
      lastName.trim() === "" ||
      nin.trim() === "" ||
      dob.trim() === "" ||
      address.trim() === ""
    ) {
      setError(
        "Fill in your first name, last name, NIN (VNIN), date of birth and current address.",
      );
      return;
    }

    setPhase("verifying");
    const ninResult = await verifyNinAction({
      nin: nin.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      ...(dob.trim() !== "" ? { dob: dob.trim() } : {}),
    });

    if (!ninResult.ok) {
      setError(ninResult.message);
      setPhase("idle");
      return;
    }

    if (ninResult.data.success === "failed") {
      setError(
        "We could not verify your NIN with those details. Check the number, your name and date of birth, then try again.",
      );
      setPhase("idle");
      return;
    }

    setPhase("uploading");
    const assets = await upload.uploadAll(selected.map((entry) => entry.file));

    if (assets === null) {
      setPhase("idle");
      return;
    }

    // KYC documents are stored in private delivery mode, so the submission
    // records the storage path rather than a public URL.
    const documents: KycDocumentInput[] = selected.map((entry, index) => ({
      checkType: entry.checkType,
      storagePath: assets[index]?.storagePath ?? "",
    }));

    setPhase("submitting");
    const claims: Record<string, string> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      nin: nin.trim(),
      dateOfBirth: dob.trim(),
      currentAddress: address.trim(),
    };
    const trimmedMiddleName = middleName.trim();
    if (trimmedMiddleName !== "") {
      claims.middleName = trimmedMiddleName;
    }

    const result = await submitKycAction({ documents, claims });

    if (!result.ok) {
      setError(result.message);
      setPhase("idle");
      return;
    }

    setPhase("done");
    router.refresh();
  };

  if (phase === "done") {
    return (
      <AuthCard variant="checklist" className={className}>
        <p className="text-body-md font-semibold text-neutral-900">
          Submission received
        </p>
        <p className="text-body-sm text-neutral-700">
          We&apos;re reviewing your documents. You can close this page — we&apos;ll
          email you when it&apos;s done.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard variant="details" className={className}>
      <div className="flex flex-col gap-1">
        <p className="text-label-lg font-semibold text-neutral-900">
          Upload your documents
        </p>
        {account.onboarding.applicantMessage ? (
          <p className="text-body-sm text-neutral-700">
            {account.onboarding.applicantMessage}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input label="First name" name="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} disabled={isBusy} />
        <Input label="Middle name (optional)" name="middleName" value={middleName} onChange={(event) => setMiddleName(event.target.value)} disabled={isBusy} />
        <Input label="Last name" name="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={isBusy} />
        <Input label="NIN (VNIN)" name="nin" inputMode="numeric" placeholder="12345678901" value={nin} onChange={(event) => setNin(event.target.value)} disabled={isBusy} />
        <Input label="Date of birth" name="dob" type="date" value={dob} onChange={(event) => setDob(event.target.value)} disabled={isBusy} />
        <Input label="Current address" name="address" value={address} onChange={(event) => setAddress(event.target.value)} disabled={isBusy} />
      </div>

      {KYC_CHECKS.map((check) => {
        const inputId = `${groupId}-${check.checkType}`;
        const file = files[check.checkType] ?? null;
        return (
          <div key={check.checkType} className="flex flex-col gap-2">
            <label
              htmlFor={inputId}
              className="text-label-md font-semibold text-neutral-800"
            >
              {check.title}
            </label>
            <p className="text-label-sm text-neutral-700">{check.description}</p>
            <input
              id={inputId}
              name={check.checkType}
              type="file"
              accept={acceptAttribute("KYC")}
              disabled={isBusy}
              onChange={(event) =>
                setFile(check.checkType, event.target.files?.[0] ?? null)
              }
              className={cn(
                "w-full rounded-md border border-neutral-200 bg-white p-2 text-body-sm text-neutral-800",
                "file:mr-3 file:rounded-sm file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-label-sm file:font-semibold file:text-neutral-900",
                "focus:border-brand-700 focus:outline-1 focus:outline-brand-700 disabled:cursor-not-allowed disabled:bg-neutral-50",
              )}
            />
            <p className="text-label-sm text-neutral-700">
              {file !== null ? file.name : describeLimits("KYC")}
            </p>
          </div>
        );
      })}

      <Button
        type="button"
        fullWidth
        isLoading={isBusy}
        disabled={!hasRequiredFile}
        onClick={handleSubmit}
      >
        {phase === "verifying"
          ? "Verifying your NIN…"
          : phase === "uploading"
            ? `Uploading documents… ${upload.progress}%`
            : phase === "submitting"
              ? "Submitting for review…"
              : "Submit for review"}
      </Button>

      <Link
        href={skipHref}
        className={buttonClasses({ variant: "secondary", fullWidth: true })}
      >
        Skip for now
      </Link>

      {problem !== null ? (
        <p role="alert" className="text-center text-label-sm text-error-600">
          {problem}
        </p>
      ) : null}
    </AuthCard>
  );
}
