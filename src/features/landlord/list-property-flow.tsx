"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AUTH_ROUTES } from "@/constants/auth";
import { LANDLORD_ROUTES } from "@/constants/landlord";
import {
  attachMediaAction,
  createMediaTicketAction,
  createPropertyAction,
  publishPropertyAction,
} from "@/lib/api/actions/properties";
import type { PropertyDraft } from "@/lib/api/actions/properties";
import {
  acceptAttribute,
  describeLimits,
  validateFiles,
} from "@/lib/media/scopes";
import { useMediaUpload } from "@/lib/media/use-media-upload";

type Step = "details" | "review" | "published";

interface ListingDetails {
  title: string;
  address: string;
  city: string;
  state: string;
  country: string;
  propertyType: string;
  rent: string;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
  description: string;
  amenities: string[];
}

const INITIAL_DETAILS: ListingDetails = {
  title: "",
  address: "",
  city: "",
  state: "",
  country: "Nigeria",
  propertyType: "Apartment",
  rent: "",
  bedrooms: "2",
  bathrooms: "1",
  squareFeet: "",
  description: "",
  amenities: [],
};

const AMENITIES = [
  "In-unit washer & dryer",
  "Dedicated parking",
  "Central heating",
  "Pet-friendly",
  "Elevator access",
  "Storage unit included",
] as const;

const PROPERTY_TYPES = ["Apartment", "House", "Duplex", "Studio"] as const;

function toMinor(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const minor = Number(`${whole}${`${fraction}00`.slice(0, 2)}`);
  return Number.isSafeInteger(minor) ? minor : null;
}

function Progress({ step }: { step: Step }) {
  const activeCount = step === "details" ? 1 : step === "review" ? 2 : 3;

  return (
    <div className="flex gap-2" aria-label={`Step ${activeCount} of 3`}>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={`h-1 flex-1 rounded-full ${
            index < activeCount ? "bg-brand-700" : "bg-neutral-200"
          }`}
        />
      ))}
    </div>
  );
}

function FlowHeader({ step }: { step: Step }) {
  const title =
    step === "details"
      ? "List your property"
      : step === "review"
        ? "Review your listing"
        : "Your listing is live";
  const subtitle =
    step === "details"
      ? "Step 2 of 3 — Property details"
      : step === "review"
        ? "Step 3 of 3 — Confirm details before it goes live"
        : "Your property is now visible to tenants browsing Vemra.";

  return (
    <header className="flex flex-col gap-1">
      <h1 className="font-display text-heading-lg font-bold text-neutral-900 md:text-heading-xl">
        {title}
      </h1>
      <p className="text-body-sm text-neutral-700">{subtitle}</p>
      {step !== "published" ? <Progress step={step} /> : null}
    </header>
  );
}

export function ListPropertyFlow({ initialStep }: { initialStep: Step }) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [details, setDetails] = useState(INITIAL_DETAILS);
  const [photos, setPhotos] = useState<File[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [publishedId, setPublishedId] = useState<string | null>(null);

  // The ticket endpoint is scoped to a property, which only exists once the
  // draft has been created — so the id is filled in mid-publish.
  const propertyIdRef = useRef<string | null>(null);
  const requestTicket = useCallback((file: File) => {
    const propertyId = propertyIdRef.current;
    if (propertyId === null) {
      return Promise.resolve({
        ok: false as const,
        message: "The listing must be created before photos can be uploaded.",
      });
    }
    return createMediaTicketAction(propertyId, {
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    });
  }, []);
  const upload = useMediaUpload("PROPERTY_MEDIA", requestTicket);

  function update(field: keyof ListingDetails, value: string) {
    setDetails((current) => ({ ...current, [field]: value }));
  }

  function goTo(next: Step) {
    setStep(next);
    router.replace(`${LANDLORD_ROUTES.newProperty}?step=${next}`);
  }

  async function publish() {
    const rentAmountMinor = toMinor(details.rent);

    if (rentAmountMinor === null || rentAmountMinor <= 0) {
      setFieldErrors({ rent: "Enter a rent amount like 1450000." });
      setError("Fix the highlighted field before publishing.");
      goTo("details");
      return;
    }

    setIsPublishing(true);
    setError(null);
    setFieldErrors({});
    upload.reset();

    const draft: PropertyDraft = {
      title: details.title.trim(),
      description: details.description.trim(),
      propertyType: details.propertyType,
      bedrooms: Number(details.bedrooms),
      bathrooms: Number(details.bathrooms),
      squareFeet: Number(details.squareFeet || "0"),
      amenities: details.amenities,
      rentAmountMinor,
      rentCurrency: "NGN",
      rentPeriod: "yearly",
      location: {
        address: details.address.trim(),
        city: details.city.trim(),
        state: details.state.trim(),
        country: details.country.trim(),
      },
    };

    setProgress("Creating the listing…");
    const created = await createPropertyAction(draft);

    if (!created.ok) {
      if (created.kycRequired) {
        router.push(AUTH_ROUTES.signupVerification);
        setProgress(null);
        setIsPublishing(false);
        return;
      }
      setError(created.message);
      setFieldErrors({ ...(created.fieldErrors ?? {}) });
      setProgress(null);
      setIsPublishing(false);
      return;
    }

    const propertyId = created.data.propertyId;
    propertyIdRef.current = propertyId;

    if (photos.length > 0) {
      setProgress(`Uploading ${photos.length} photo${photos.length === 1 ? "" : "s"}…`);
      const assets = await upload.uploadAll(photos);

      if (assets === null) {
        setError(
          `The listing was created but its photos could not be uploaded: ${
            upload.error ?? "the upload failed"
          }. Add them from the listing page.`,
        );
        setProgress(null);
        setIsPublishing(false);
        return;
      }

      for (const [index, asset] of assets.entries()) {
        setProgress(`Attaching photo ${index + 1} of ${assets.length}…`);
        const attached = await attachMediaAction(
          propertyId,
          asset.url,
          index === 0,
          index,
        );
        if (!attached.ok) {
          if (attached.kycRequired) {
            router.push(AUTH_ROUTES.signupVerification);
            setProgress(null);
            setIsPublishing(false);
            return;
          }
          setError(
            `The listing was created but photo ${index + 1} could not be attached: ${attached.message}`,
          );
          setProgress(null);
          setIsPublishing(false);
          return;
        }
      }
    }

    setProgress("Publishing…");
    const published = await publishPropertyAction(propertyId);

    if (!published.ok) {
      if (published.kycRequired) {
        router.push(AUTH_ROUTES.signupVerification);
        setProgress(null);
        setIsPublishing(false);
        return;
      }
      setError(
        `The listing was created but could not be published: ${published.message}`,
      );
      setProgress(null);
      setIsPublishing(false);
      return;
    }

    setPublishedId(propertyId);
    setProgress(null);
    setIsPublishing(false);
    goTo("published");
  }

  if (step === "published" && publishedId !== null) {
    return (
      <div className="mx-auto flex w-full max-w-85 flex-col items-center gap-6 py-8 text-center md:py-16">
        <div className="flex size-16 items-center justify-center rounded-xl bg-brand-50 text-heading-lg text-brand-700">
          ✓
        </div>
        <FlowHeader step={step} />
        <div className="flex w-full gap-2">
          <Link
            href={`${LANDLORD_ROUTES.properties}/${publishedId}`}
            className={buttonClasses({
              variant: "secondary",
              size: "sm",
              className: "flex-1",
            })}
          >
            View listing
          </Link>
          <Link
            href={LANDLORD_ROUTES.overview}
            className={buttonClasses({ size: "sm", className: "flex-1" })}
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="flex flex-col gap-5 md:gap-6">
        <FlowHeader step={step} />

        <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 md:p-5">
          <h2 className="text-body-md font-semibold text-neutral-900">
            Summary
          </h2>
          {[
            ["Title", details.title || "—"],
            [
              "Address",
              [details.address, details.city, details.state]
                .filter((part) => part.trim() !== "")
                .join(", ") || "—",
            ],
            ["Type", details.propertyType],
            [
              "Bedrooms/Bathrooms",
              `${details.bedrooms} bed · ${details.bathrooms} bath`,
            ],
            ["Annual rent", details.rent === "" ? "—" : `₦${details.rent}`],
            [
              "Amenities",
              details.amenities.length === 0
                ? "None selected"
                : details.amenities.join(", "),
            ],
            [
              "Photos",
              photos.length === 0
                ? "None selected"
                : `${photos.length} selected`,
            ],
            ["Property Admin assignment", "Assigned by Vemra after review"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-4 text-label-sm"
            >
              <span className="text-neutral-700">{label}</span>
              <span className="text-right font-semibold text-neutral-900">
                {value}
              </span>
            </div>
          ))}
          <button
            type="button"
            onClick={() => goTo("details")}
            className="self-start text-label-md font-semibold text-brand-700"
          >
            Edit any of these →
          </button>
        </section>

        <div className="flex flex-col gap-3">
          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => goTo("details")}
              className="text-label-md font-semibold text-brand-700"
            >
              Back
            </button>
            <Button
              size="sm"
              isLoading={isPublishing}
              disabled={isPublishing}
              onClick={() => void publish()}
            >
              Publish listing
            </Button>
          </div>

          <p aria-live="polite" className="min-h-5 text-label-sm">
            {error !== null ? (
              <span role="alert" className="text-error-600">
                {error}
              </span>
            ) : progress !== null ? (
              <span className="text-neutral-700">
                {progress}
                {upload.isUploading ? ` ${upload.progress}%` : ""}
              </span>
            ) : null}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-5 md:gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        goTo("review");
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <FlowHeader step={step} />
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 md:gap-5 md:p-6">
        <div>
          <h2 className="text-body-md font-semibold text-neutral-900">
            Basic details
          </h2>
          <p className="mt-1 text-label-sm text-neutral-700">
            This appears at the top of your listing.
          </p>
        </div>

        <Input
          label="Listing title"
          name="title"
          value={details.title}
          onChange={(event) => update("title", event.target.value)}
          error={fieldErrors.title}
          required
        />
        <Input
          label="Street address"
          name="address"
          value={details.address}
          onChange={(event) => update("address", event.target.value)}
          error={fieldErrors.address}
          autoComplete="street-address"
          required
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="City"
            name="city"
            value={details.city}
            onChange={(event) => update("city", event.target.value)}
            error={fieldErrors.city}
            required
          />
          <Input
            label="State"
            name="state"
            value={details.state}
            onChange={(event) => update("state", event.target.value)}
            error={fieldErrors.state}
            required
          />
          <Input
            label="Country"
            name="country"
            value={details.country}
            onChange={(event) => update("country", event.target.value)}
            error={fieldErrors.country}
            required
          />
          <Input
            label="Annual rent (₦)"
            name="rent"
            inputMode="decimal"
            value={details.rent}
            onChange={(event) => update("rent", event.target.value)}
            error={fieldErrors.rent}
            required
          />
          <label className="flex flex-col gap-1.5 text-label-md font-semibold text-neutral-800">
            Property type
            <select
              value={details.propertyType}
              onChange={(event) => update("propertyType", event.target.value)}
              className="h-11 rounded-md border border-neutral-200 bg-white px-3 text-body-md font-normal outline-none focus:border-brand-700"
            >
              {PROPERTY_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <Input
            label="Floor area (sq ft)"
            name="squareFeet"
            inputMode="numeric"
            value={details.squareFeet}
            onChange={(event) => update("squareFeet", event.target.value)}
            error={fieldErrors.squareFeet}
          />
          <label className="flex flex-col gap-1.5 text-label-md font-semibold text-neutral-800">
            Bedrooms
            <select
              value={details.bedrooms}
              onChange={(event) => update("bedrooms", event.target.value)}
              className="h-11 rounded-md border border-neutral-200 bg-white px-3 text-body-md font-normal outline-none focus:border-brand-700"
            >
              {["1", "2", "3", "4", "5"].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-label-md font-semibold text-neutral-800">
            Bathrooms
            <select
              value={details.bathrooms}
              onChange={(event) => update("bathrooms", event.target.value)}
              className="h-11 rounded-md border border-neutral-200 bg-white px-3 text-body-md font-normal outline-none focus:border-brand-700"
            >
              {["1", "2", "3", "4"].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Textarea
          label="Description"
          name="description"
          value={details.description}
          onChange={(event) => update("description", event.target.value)}
          fieldClassName="min-h-28"
          required
        />
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 md:p-6">
        <div>
          <h2 className="text-body-md font-semibold text-neutral-900">
            Amenities
          </h2>
          <p className="mt-1 text-label-sm text-neutral-700">
            Select everything that applies.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {AMENITIES.map((amenity) => {
            const checked = details.amenities.includes(amenity);
            return (
              <label
                key={amenity}
                className="flex items-center gap-2 text-label-md text-neutral-800"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setDetails((current) => ({
                      ...current,
                      amenities: checked
                        ? current.amenities.filter((item) => item !== amenity)
                        : [...current.amenities, amenity],
                    }))
                  }
                  className="size-4 accent-brand-700"
                />
                {amenity}
              </label>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 md:p-6">
        <div>
          <h2 className="text-body-md font-semibold text-neutral-900">Photos &amp; videos</h2>
          <p className="mt-1 text-label-sm text-neutral-700">
            Add at least 3 photos or videos. The first will be the cover image.
          </p>
        </div>
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-center">
          <span className="text-body-md text-brand-700">▧</span>
          <span className="text-label-md font-semibold text-neutral-900">
            {photos.length === 0
              ? "Click to upload or drag files here"
              : `${photos.length} item${photos.length === 1 ? "" : "s"} selected`}
          </span>
          <span className="text-label-sm text-neutral-700">
            {describeLimits("PROPERTY_MEDIA")} each
          </span>
          <input
            type="file"
            accept={acceptAttribute("PROPERTY_MEDIA")}
            multiple
            className="sr-only"
            onChange={(event) => {
              const selected = [...(event.target.files ?? [])];
              const problem = validateFiles("PROPERTY_MEDIA", selected);

              if (problem !== null) {
                setError(problem);
                setPhotos([]);
                event.target.value = "";
                return;
              }

              setError(null);
              setPhotos(selected);
            }}
          />
        </label>

        <p aria-live="polite" className="min-h-5 text-label-sm">
          {error === null ? null : (
            <span role="alert" className="text-error-600">
              {error}
            </span>
          )}
        </p>
      </section>

      <div className="flex items-center justify-between gap-3">
        <Link
          href={LANDLORD_ROUTES.properties}
          className="text-label-md font-semibold text-brand-700"
        >
          Back
        </Link>
        <Button type="submit" size="sm">
          Continue to review
        </Button>
      </div>
    </form>
  );
}
