import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DotIcon } from "@/components/icons/dot-icon";
import {
  LANDLORD_MANAGE_LISTING,
  LANDLORD_ROUTES,
} from "@/constants/landlord";
import { ListingGallery } from "@/features/landlord/listing-gallery";
import { ListingMediaManager } from "@/features/landlord/listing-media-manager";
import { ManageListingForm } from "@/features/landlord/manage-listing-form";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { getLandlordProperty } from "@/lib/api/resources/landlord";
import { requireKycApproved } from "@/lib/api/resources/auth";
import { isUuid } from "@/lib/validation";

const { breadcrumbLabel, listedSincePrefix } = LANDLORD_MANAGE_LISTING;

export async function generateMetadata({
  params,
}: PageProps<"/landlord/properties/[propertyId]">): Promise<Metadata> {
  const { propertyId } = await params;

  if (!isUuid(propertyId)) {
    return { title: "Manage listing · Vemra" };
  }

  const property = await getLandlordProperty(propertyId);

  if (!property) return { title: "Manage listing · Vemra" };

  return {
    title: `${property.name} · Vemra`,
    description: property.description,
  };
}

export default async function ManageListingPage({
  params,
}: PageProps<"/landlord/properties/[propertyId]">) {
  const { propertyId } = await params;

  if (!isUuid(propertyId)) {
    notFound();
  }

  await requireKycApproved(`/landlord/properties/${propertyId}`);

  const property = await getLandlordProperty(propertyId);

  if (!property) notFound();

  const isOccupied = property.status === "occupied";

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <div className="flex flex-col gap-2 md:gap-3">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-2 text-body-sm">
            <li>
              <Link
                href={LANDLORD_ROUTES.properties}
                className="rounded-sm text-neutral-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              >
                {breadcrumbLabel}
              </Link>
            </li>
            <li aria-hidden="true" className="text-neutral-400">
              /
            </li>
            <li
              aria-current="page"
              className="min-w-0 truncate font-semibold text-brand-700"
            >
              {property.name}
            </li>
          </ol>
        </nav>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="min-w-0">
            <h1 className="font-display text-heading-lg font-bold text-neutral-900 md:text-heading-xl">
              {property.name}
            </h1>
            <p className="text-body-sm text-neutral-700">
              {listedSincePrefix} {formatDate(property.listedSince, "monthYear")}
            </p>
          </div>

          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-2 self-start rounded-full border px-3 py-1.5 text-body-sm font-semibold md:self-auto",
              isOccupied
                ? "border-success-600 bg-success-50 text-success-600"
                : "border-warning-600 bg-warning-50 text-warning-600",
            )}
          >
            <DotIcon className="size-2" />
            {property.status}
          </span>
        </div>
      </div>

      <ListingGallery property={property} />

      <ListingMediaManager
        propertyId={property.id}
        photos={property.photos}
      />

      <ManageListingForm property={property} />
    </div>
  );
}
