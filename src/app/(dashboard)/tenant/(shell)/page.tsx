import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { ResponsiveText } from "@/components/ui/responsive-text";
import { TENANT_ROUTES } from "@/constants/tenant";
import { LoadErrorPanel } from "@/features/errors/load-error-panel";
import { KycBanner } from "@/features/kyc/kyc-banner";
import { MetricCardRow } from "@/features/tenant/metric-card-row";
import { RecentPaymentsPanel } from "@/features/tenant/recent-payments-panel";
import { getKycState } from "@/lib/api/resources/auth";
import {
  getTenantDashboard,
  getTenantPayments,
} from "@/lib/api/resources/tenant";

export const metadata: Metadata = {
  title: "Overview · Vemra",
  description: "Rent and payment plan at a glance.",
};

export default async function TenantOverviewPage() {
  const [dashboard, payments, kyc] = await Promise.all([
    getTenantDashboard(),
    getTenantPayments(),
    getKycState(),
  ]);

  return (
    <div className="flex flex-col gap-5 md:gap-8">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-heading-lg font-bold text-neutral-900 md:text-heading-xl">
            {dashboard.ok && dashboard.data.tenantName !== ""
              ? `Hi ${dashboard.data.tenantName}`
              : "Overview"}
          </h1>
          <p className="text-body-md text-neutral-700 md:text-body-lg">
            {dashboard.ok
              ? (dashboard.data.unit?.name ?? "No active rental")
              : "Rent details are unavailable right now."}
          </p>
        </div>
        <Link
          href={TENANT_ROUTES.paymentPlan}
          className={buttonClasses({
            size: "sm",
            className:
              "max-md:h-8 max-md:px-3 max-md:text-label-sm md:h-11 md:px-6",
          })}
        >
          <ResponsiveText copy={{ base: "Pay Rent", md: "Make a payment" }} />
        </Link>
      </div>

      <KycBanner state={kyc} role="TENANT" />

      {dashboard.ok ? (
        <MetricCardRow dashboard={dashboard.data} />
      ) : (
        <LoadErrorPanel label="Your rent summary" failure={dashboard} />
      )}

      <div className="grid gap-5 md:gap-6">
        {payments.ok ? (
          <RecentPaymentsPanel payments={payments.data} />
        ) : (
          <LoadErrorPanel label="Your recent payments" failure={payments} />
        )}
      </div>
    </div>
  );
}
