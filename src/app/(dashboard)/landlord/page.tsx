import type { Metadata } from "next";

import { LoadErrorPanel } from "@/features/errors/load-error-panel";
import { DashboardHeader } from "@/features/landlord/dashboard-header";
import { EmptyDashboard } from "@/features/landlord/empty-dashboard";
import { PropertiesOverviewTable } from "@/features/landlord/properties-overview-table";
import { RevenueRollCard } from "@/features/landlord/revenue-roll-card";
import { StatCardGrid } from "@/features/landlord/stat-card-grid";
import { WithdrawWidget } from "@/features/landlord/withdraw-widget";
import { KycBanner } from "@/features/kyc/kyc-banner";
import { getKycState } from "@/lib/api/resources/auth";
import {
  getLandlordDashboard,
  getLandlordProperties,
} from "@/lib/api/resources/landlord";

export const metadata: Metadata = {
  title: "Overview · Vemra",
  description: "Occupancy, payouts and property performance at a glance.",
};

export default async function LandlordOverviewPage({
  searchParams,
}: PageProps<"/landlord">) {
  const { state } = await searchParams;

  if (state === "empty") {
    return <EmptyDashboard />;
  }

  const [dashboard, properties, kyc] = await Promise.all([
    getLandlordDashboard(),
    getLandlordProperties(),
    getKycState(),
  ]);

  if (!dashboard.ok) {
    return (
      <div className="flex flex-col gap-5 md:gap-8">
        <LoadErrorPanel label="Your dashboard" failure={dashboard} />
        {properties.ok ? (
          <div className="hidden md:grid md:gap-6">
            <PropertiesOverviewTable properties={properties.data} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 md:gap-8">
      <DashboardHeader dashboard={dashboard.data} />

      <KycBanner state={kyc} role="LANDLORD" />

      <StatCardGrid dashboard={dashboard.data} />

      <RevenueRollCard dashboard={dashboard.data} />

      <div className="hidden md:grid md:gap-6 lg:grid-cols-[678fr_378fr]">
        {properties.ok ? (
          <PropertiesOverviewTable properties={properties.data} />
        ) : (
          <LoadErrorPanel label="Your properties" failure={properties} />
        )}

        <div className="hidden flex-col gap-6 lg:flex">
          <WithdrawWidget dashboard={dashboard.data} />
        </div>
      </div>
    </div>
  );
}
