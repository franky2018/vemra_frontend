import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { KycGate } from "@/components/kyc/kyc-gate";
import { ResponsiveText } from "@/components/ui/responsive-text";
import type { TabItem } from "@/components/ui/tabs";
import { Tabs } from "@/components/ui/tabs";
import { AUTH_ROUTES } from "@/constants/auth";
import {
  LANDLORD_PROPERTIES_SCREEN,
} from "@/constants/landlord";
import { LoadErrorPanel } from "@/features/errors/load-error-panel";
import { PropertiesPanel } from "@/features/landlord/properties-panel";
import { getKycState } from "@/lib/api/resources/auth";
import { getLandlordProperties } from "@/lib/api/resources/landlord";
import type { LandlordPropertySummary } from "@/types/api/landlord";

export const metadata: Metadata = {
  title: "Properties · Vemra",
  description:
    "Every property you own, with its tenant, Property Admin and rent.",
};

const { title, summary, addAction, filters } = LANDLORD_PROPERTIES_SCREEN;

function filterProperties(
  id: string,
  properties: readonly LandlordPropertySummary[],
): readonly LandlordPropertySummary[] {
  if (id === "all") return properties;
  return properties.filter(
    (property) => property.status === id,
  );
}

export default async function LandlordPropertiesPage() {
  const [properties, kyc] = await Promise.all([
    getLandlordProperties(),
    getKycState(),
  ]);
  const items: TabItem[] = filters.map((filter) => {
    const filteredProperties = properties.ok
      ? filterProperties(filter.id, properties.data)
      : [];

    return {
      id: filter.id,
      label: `${filter.label} (${filteredProperties.length})`,
      content: <PropertiesPanel properties={filteredProperties} />,
    };
  });

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-heading-sm font-semibold text-neutral-900 md:text-heading-xl md:font-bold">
            {title}
          </h1>
          <p className="text-body-md text-neutral-800 max-md:hidden">
            {summary}
          </p>
        </div>

        <KycGate
          approved={kyc.approved}
          href={AUTH_ROUTES.signupVerification}
          label="Add property"
          description="Complete identity verification to list properties."
        >
          <Link
            href={addAction.href}
            className={buttonClasses({
              className: "max-md:h-7 max-md:px-3 max-md:text-label-sm",
            })}
          >
            <ResponsiveText copy={addAction.label} />
          </Link>
        </KycGate>
      </div>

      {properties.ok ? (
        <Tabs items={items} label="Filter properties by status" />
      ) : (
        <LoadErrorPanel label="Your properties" failure={properties} />
      )}
    </div>
  );
}
