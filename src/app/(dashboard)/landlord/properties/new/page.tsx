import type { Metadata } from "next";

import { ListPropertyFlow } from "@/features/landlord/list-property-flow";
import { requireKycApproved } from "@/lib/api/resources/auth";

export const metadata: Metadata = {
  title: "List a property · Vemra",
  description: "Add and publish a new property on Vemra.",
};

export default async function NewPropertyPage({
  searchParams,
}: PageProps<"/landlord/properties/new">) {
  await requireKycApproved("/landlord/properties/new");

  const { step } = await searchParams;
  const initialStep =
    step === "review" || step === "published" ? step : "details";

  return <ListPropertyFlow initialStep={initialStep} />;
}
