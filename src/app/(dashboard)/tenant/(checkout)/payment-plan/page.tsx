import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EMPTY_CHECKOUT_SUMMARY } from "@/constants/tenant-payments";
import { TENANT_ROUTES } from "@/constants/tenant";
import { CheckoutCard } from "@/features/tenant/checkout-card";
import { CheckoutSummaryPanel } from "@/features/tenant/checkout-summary-panel";
import { LeasePicker } from "@/features/tenant/lease-picker";
import { PayRentForm } from "@/features/tenant/pay-rent-form";
import { LoadErrorPanel } from "@/features/errors/load-error-panel";
import { requireKycApproved } from "@/lib/api/resources/auth";
import { getLease, resolveLeaseSelection } from "@/lib/api/resources/tenant";
import type { CheckoutSummary } from "@/types/api/tenant";

export const metadata: Metadata = {
  title: "Pay rent · Vemra",
  description: "Complete a rent payment on Vemra.",
};

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export default async function TenantPaymentPlanPage({
  searchParams,
}: PageProps<"/tenant/payment-plan">) {
  await requireKycApproved("/tenant/payment-plan");

  const params = await searchParams;
  const selection = await resolveLeaseSelection(firstValue(params.leaseId));

  if (selection.kind === "invalid") {
    notFound();
  }

  if (selection.kind === "error") {
    return (
      <CheckoutCard
        summary={<CheckoutSummaryPanel summary={EMPTY_CHECKOUT_SUMMARY} />}
      >
        <LoadErrorPanel
          label="Your leases"
          failure={{
            ok: false,
            message: selection.message,
            requestId: selection.requestId,
            isWaking: selection.isWaking,
          }}
        />
      </CheckoutCard>
    );
  }

  if (selection.kind === "none") {
    return (
      <CheckoutCard
        summary={<CheckoutSummaryPanel summary={EMPTY_CHECKOUT_SUMMARY} />}
      >
        <p className="text-body-md text-neutral-700">
          There is no active lease on your account, so there is nothing to pay
          yet.
        </p>
      </CheckoutCard>
    );
  }

  if (selection.kind === "choose") {
    return (
      <CheckoutCard
        summary={<CheckoutSummaryPanel summary={EMPTY_CHECKOUT_SUMMARY} />}
      >
        <LeasePicker
          leases={selection.leases}
          basePath={TENANT_ROUTES.paymentPlan}
          title="Which lease are you paying for?"
          description="Pick the lease this payment should be applied to. Vemra never guesses."
        />
      </CheckoutCard>
    );
  }

  const lease = await getLease(selection.leaseId);

  if (!lease.ok) {
    return (
      <CheckoutCard
        summary={<CheckoutSummaryPanel summary={EMPTY_CHECKOUT_SUMMARY} />}
      >
        <LoadErrorPanel label="This lease" failure={lease} />
      </CheckoutCard>
    );
  }

  const nextDue = lease.data.billingSchedules
    .filter((schedule) => schedule.status !== "PAID")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const summary: CheckoutSummary = {
    label: nextDue === undefined ? "Annual rent" : "Next rent instalment",
    amount: nextDue === undefined ? lease.data.annualRent : nextDue.amount,
    unit: {
      id: lease.data.propertyId,
      name: "Your rental",
      propertyId: lease.data.propertyId,
    },
    landlordName: null,
    dueDate: nextDue?.dueDate ?? lease.data.startDate,
    installmentSequence: null,
    installmentTotal: null,
  };

  return (
    <CheckoutCard summary={<CheckoutSummaryPanel summary={summary} />}>
      <PayRentForm leaseId={selection.leaseId} />
    </CheckoutCard>
  );
}
