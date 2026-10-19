"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AUTH_ROUTES } from "@/constants/auth";
import { LANDLORD_MANAGE_LISTING, LANDLORD_ROUTES } from "@/constants/landlord";
import {
  unlistPropertyAction,
  updatePropertyAction,
} from "@/lib/api/actions/properties";
import type { LandlordProperty } from "@/types/api/landlord";

const { details, danger, footer } = LANDLORD_MANAGE_LISTING;

function toMinor(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const minor = Number(`${whole}${`${fraction}00`.slice(0, 2)}`);
  return Number.isSafeInteger(minor) ? minor : null;
}

export interface ManageListingFormProps {
  property: LandlordProperty;
}

export function ManageListingForm({ property }: ManageListingFormProps) {
  const router = useRouter();
  const [address, setAddress] = useState(property.address);
  const [rent, setRent] = useState(String(property.rent.minor / 100));
  const [bedrooms, setBedrooms] = useState(
    property.bedrooms === null ? "" : String(property.bedrooms),
  );
  const [description, setDescription] = useState(property.description);
  const [isSaving, setIsSaving] = useState(false);
  const [isUnlisting, setIsUnlisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isBusy = isSaving || isUnlisting;

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();

        const rentAmountMinor = toMinor(rent);
        if (rentAmountMinor === null || rentAmountMinor <= 0) {
          setFieldErrors({ rent: "Enter a rent amount like 1450000." });
          setError("Fix the highlighted field before saving.");
          return;
        }

        setIsSaving(true);
        setError(null);
        setFieldErrors({});

        const parsedBedrooms = bedrooms.trim() === "" ? undefined : Number(bedrooms);

        const result = await updatePropertyAction(property.id, {
          description: description.trim(),
          rentAmountMinor,
          rentCurrency: property.rent.currency,
          ...(parsedBedrooms !== undefined && Number.isFinite(parsedBedrooms)
            ? { bedrooms: parsedBedrooms }
            : {}),
        });

        if (result.ok) {
          router.push(LANDLORD_ROUTES.properties);
          return;
        }

        if (result.kycRequired) {
          router.push(AUTH_ROUTES.signupVerification);
          return;
        }

        setError(result.message);
        setFieldErrors({ ...(result.fieldErrors ?? {}) });
        setIsSaving(false);
      }}
      className="flex flex-col gap-4 md:gap-8"
    >
      <section
        aria-labelledby="listing-details-title"
        className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 md:gap-6 md:p-6"
      >
        <h2
          id="listing-details-title"
          className="font-display text-heading-sm font-semibold text-neutral-900"
        >
          {details.title}
        </h2>

        <div className="flex flex-col gap-4">
          <Input
            label={details.addressLabel}
            name="address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            autoComplete="street-address"
            helperText="The address is managed by Vemra and is not editable here."
            readOnly
            disabled
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={details.rentLabel}
              name="rent"
              value={rent}
              onChange={(event) => setRent(event.target.value)}
              error={fieldErrors.rent}
              inputMode="decimal"
            />
            <Input
              label={details.bedroomsLabel}
              name="bedrooms"
              value={bedrooms}
              onChange={(event) => setBedrooms(event.target.value)}
              error={fieldErrors.bedrooms}
              inputMode="numeric"
            />
          </div>

          <Textarea
            label={details.descriptionLabel}
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            error={fieldErrors.description}
            fieldClassName="h-25 md:h-20"
          />
        </div>
      </section>

      <section
        aria-labelledby="listing-danger-title"
        className="flex flex-col gap-4 rounded-lg border border-error-600 bg-error-50 p-4 md:flex-row md:items-center md:justify-between md:gap-6 md:p-6"
      >
        <div className="min-w-0">
          <h2
            id="listing-danger-title"
            className="text-body-md font-semibold text-error-600"
          >
            {danger.title}
          </h2>
          <p className="text-body-sm text-neutral-800">{danger.description}</p>
        </div>

        <Button
          variant="destructive"
          size="sm"
          type="button"
          isLoading={isUnlisting}
          disabled={isBusy}
          className="max-md:h-9 max-md:w-full md:shrink-0"
          onClick={async () => {
            setIsUnlisting(true);
            setError(null);

            const result = await unlistPropertyAction(property.id);

            if (result.ok) {
              router.push(LANDLORD_ROUTES.properties);
              return;
            }

            setError(result.message);
            setIsUnlisting(false);
          }}
        >
          {danger.action}
        </Button>
      </section>

      <p aria-live="polite" className="min-h-5 text-label-sm">
        {error === null ? null : (
          <span role="alert" className="text-error-600">
            {error}
          </span>
        )}
      </p>

      <div className="flex gap-4 md:justify-end">
        <Link
          href={LANDLORD_ROUTES.properties}
          className={buttonClasses({
            variant: "secondary",
            className: "max-md:flex-1",
          })}
        >
          {footer.cancel}
        </Link>

        <Button
          type="submit"
          isLoading={isSaving}
          disabled={isBusy}
          className="max-md:flex-1"
        >
          {footer.save}
        </Button>
      </div>
    </form>
  );
}
