"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AUTH_ROUTES } from "@/constants/auth";
import {
  markNotificationReadAction,
  sendMessageAction,
  withdrawApplicationAction,
} from "@/lib/api/actions/engagement";
import {
  acceptDepositDecisionAction,
  disputeDepositDecisionAction,
  signLeaseAction,
} from "@/lib/api/actions/leases";
import { unsaveProperty } from "@/lib/api/actions/properties";
import type { ActionResult } from "@/lib/api/actions/action-result";

type Runner = () => Promise<ActionResult<unknown>>;

function useAction() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (runner: Runner, success: string) => {
    setIsPending(true);
    setError(null);
    setDone(null);

    const result = await runner();

    if (result.ok) {
      setDone(success);
      router.refresh();
    } else if (result.kycRequired) {
      router.push(AUTH_ROUTES.signupVerification);
    } else {
      setError(result.message);
    }

    setIsPending(false);
  };

  return { isPending, error, done, run };
}

function Feedback({
  error,
  done,
  isPending,
}: {
  error: string | null;
  done: string | null;
  isPending: boolean;
}) {
  return (
    <p aria-live="polite" className="min-h-5 text-label-sm">
      {error !== null ? (
        <span role="alert" className="text-error-600">
          {error}
        </span>
      ) : isPending ? (
        <span className="text-neutral-700">Working…</span>
      ) : done !== null ? (
        <span className="text-success-600">{done}</span>
      ) : null}
    </p>
  );
}

export function SignLeaseButton({ leaseId }: { leaseId: string }) {
  const { isPending, error, done, run } = useAction();

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        fullWidth
        isLoading={isPending}
        disabled={isPending || done !== null}
        onClick={() =>
          void run(() => signLeaseAction(leaseId), "Lease signed.")
        }
      >
        Sign lease agreement
      </Button>
      <Feedback error={error} done={done} isPending={isPending} />
    </div>
  );
}

export function DepositDecisionActions({ leaseId }: { leaseId: string }) {
  const { isPending, error, done, run } = useAction();
  const [isDisputing, setIsDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          size="sm"
          isLoading={isPending && !isDisputing}
          disabled={isPending || done !== null}
          onClick={() =>
            void run(
              () => acceptDepositDecisionAction(leaseId),
              "Decision accepted.",
            )
          }
        >
          Accept decision
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isPending || done !== null}
          onClick={() => setIsDisputing((current) => !current)}
        >
          Dispute decision
        </Button>
      </div>

      {isDisputing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim() === "") {
              setReasonError("Tell us why you are disputing this decision.");
              return;
            }
            setReasonError(null);
            void run(
              () => disputeDepositDecisionAction(leaseId, reason),
              "Dispute submitted.",
            );
          }}
        >
          <Textarea
            label="Why are you disputing this decision?"
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            error={reasonError ?? undefined}
            fieldClassName="min-h-24"
            required
          />
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            isLoading={isPending}
            disabled={isPending || done !== null}
            className="self-start"
          >
            Submit dispute
          </Button>
        </form>
      ) : null}

      <Feedback error={error} done={done} isPending={isPending} />
    </div>
  );
}

export function WithdrawApplicationButton({
  applicationId,
}: {
  applicationId: string;
}) {
  const { isPending, error, done, run } = useAction();

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        isLoading={isPending}
        disabled={isPending || done !== null}
        onClick={() =>
          void run(
            () => withdrawApplicationAction(applicationId),
            "Application withdrawn.",
          )
        }
      >
        Withdraw
      </Button>
      <Feedback error={error} done={done} isPending={isPending} />
    </div>
  );
}

export function UnsavePropertyButton({ propertyId }: { propertyId: string }) {
  const { isPending, error, done, run } = useAction();

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        isLoading={isPending}
        disabled={isPending || done !== null}
        onClick={() =>
          void run(() => unsaveProperty(propertyId), "Removed.")
        }
      >
        Remove
      </Button>
      <Feedback error={error} done={done} isPending={isPending} />
    </div>
  );
}

export function MarkNotificationReadButton({
  notificationId,
}: {
  notificationId: string;
}) {
  const { isPending, error, done, run } = useAction();

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        isLoading={isPending}
        disabled={isPending || done !== null}
        onClick={() =>
          void run(
            () => markNotificationReadAction(notificationId),
            "Marked as read.",
          )
        }
      >
        Mark read
      </Button>
      <Feedback error={error} done={done} isPending={isPending} />
    </div>
  );
}

export function MessageComposer({
  conversationId,
}: {
  conversationId: string;
}) {
  const { isPending, error, done, run } = useAction();
  const [body, setBody] = useState("");
  const [bodyError, setBodyError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim() === "") {
          setBodyError("Write a message before sending.");
          return;
        }
        setBodyError(null);
        void run(async () => {
          const result = await sendMessageAction(conversationId, body);
          if (result.ok) {
            setBody("");
          }
          return result;
        }, "Message sent.");
      }}
    >
      <Textarea
        label="Message"
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        error={bodyError ?? undefined}
        fieldClassName="min-h-20"
      />
      <Button
        type="submit"
        size="sm"
        isLoading={isPending}
        disabled={isPending}
        className="self-start"
      >
        Send
      </Button>
      <Feedback error={error} done={done} isPending={isPending} />
    </form>
  );
}
