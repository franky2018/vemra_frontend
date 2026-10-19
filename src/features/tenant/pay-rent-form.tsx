"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ResponsiveText } from "@/components/ui/responsive-text";
import { AUTH_ROUTES } from "@/constants/auth";
import { PAY_RENT } from "@/constants/tenant-payments";
import { initiateRentPaymentAction } from "@/lib/api/actions/payments";
import type { PaymentBreakdown } from "@/lib/api/actions/payments";
import { PAYMENT_PROVIDER, isAllowedCheckoutUrl } from "@/lib/payments/provider";
import { formatMoney } from "@/lib/format";

const NO_LEASE = "Select the lease you want to pay for first.";

const BREAKDOWN_ORDER = [
  "rentMinor",
  "cautionDepositMinor",
  "tenantPlatformFeeMinor",
  "paystackFeeMinor",
] as const;

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export interface PayRentFormProps {
  leaseId: string | null;
}

export function PayRentForm({ leaseId }: PayRentFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<PaymentBreakdown | null>(null);
  const [attemptKey, setAttemptKey] = useState<string | null>(null);

  const isDisabled = leaseId === null || isSubmitting;

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();

        if (leaseId === null) {
          setError(NO_LEASE);
          return;
        }

        setIsSubmitting(true);
        setError(null);

        const key = attemptKey ?? newIdempotencyKey();
        setAttemptKey(key);

        const result = await initiateRentPaymentAction(leaseId, key);

        if (!result.ok) {
          if (result.kycRequired) {
            router.push(AUTH_ROUTES.signupVerification);
            setIsSubmitting(false);
            return;
          }
          setError(result.message);
          setIsSubmitting(false);
          return;
        }

        setBreakdown(result.data.breakdown);

        if (!isAllowedCheckoutUrl(result.data.checkoutUrl)) {
          setError(
            "The checkout link was not recognised, so nothing was charged.",
          );
          setIsSubmitting(false);
          return;
        }

        window.location.assign(result.data.checkoutUrl);
      }}
      className="flex flex-1 flex-col gap-5 lg:justify-between"
    >
      <div className="flex flex-col gap-5">
        <header className="sr-only md:not-sr-only md:flex md:flex-col md:gap-1">
          <h1 className="font-display text-heading-md font-extrabold text-neutral-900 lg:text-heading-lg">
            <ResponsiveText copy={PAY_RENT.title} />
          </h1>
          <p className="text-body-md text-neutral-700">
            <ResponsiveText copy={PAY_RENT.description} />
          </p>
        </header>

        <div className="flex items-center gap-3 rounded-md border border-neutral-200 bg-white p-3">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-sm bg-brand-50 text-label-md font-bold text-brand-700"
          >
            {PAYMENT_PROVIDER.label.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="text-label-md font-semibold text-neutral-900">
              Pay with {PAYMENT_PROVIDER.label}
            </p>
            <p className="text-label-sm text-neutral-700">
              Card, bank transfer and USSD are offered on the next screen.
            </p>
          </div>
        </div>

        {breakdown === null ? null : (
          <section
            aria-label={PAY_RENT.breakdownTitle}
            className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-white p-3"
          >
            <h2 className="text-label-md font-semibold text-neutral-900">
              {PAY_RENT.breakdownTitle}
            </h2>
            {BREAKDOWN_ORDER.map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 text-label-sm"
              >
                <span className="text-neutral-700">
                  {PAY_RENT.breakdownLabels[key]}
                </span>
                <span className="font-semibold text-neutral-900">
                  {formatMoney(
                    { minor: breakdown[key], currency: breakdown.currency },
                    { showDecimals: true },
                  )}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 border-t border-neutral-200 pt-2 text-label-md">
              <span className="font-semibold text-neutral-900">
                {PAY_RENT.breakdownLabels.totalAmountMinor}
              </span>
              <span className="font-bold text-brand-700">
                {formatMoney(
                  {
                    minor: breakdown.totalAmountMinor,
                    currency: breakdown.currency,
                  },
                  { showDecimals: true },
                )}
              </span>
            </div>
          </section>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          fullWidth
          isLoading={isSubmitting}
          disabled={isDisabled}
        >
          {isSubmitting ? PAY_RENT.pendingLabel : PAY_RENT.submitLabel}
        </Button>
        {error ? (
          <p role="alert" className="text-center text-label-sm text-error-600">
            {error}
          </p>
        ) : null}
        <p className="text-center text-label-sm text-neutral-700">
          <ResponsiveText copy={PAY_RENT.footnote} />
        </p>
      </div>
    </form>
  );
}
