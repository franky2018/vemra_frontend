# Backend requirements

Gaps found while reconciling the frontend against
<https://vemra-backend.onrender.com/docs/openapi.json>. Each item blocks or degrades a
frontend feature. Ordered by severity.

## 1. Roles must be assigned server-side and `user_metadata.role` must be ignored

**Severity: critical (privilege escalation).**

Signup calls `supabase.auth.signUp({ data: { role } })`, which writes to
`user_metadata` — a field the authenticated user can rewrite at will with
`supabase.auth.updateUser({ data: { role: "LANDLORD" } })`.

The frontend now treats `user_metadata.role` as a **signup hint only**: all
authorization and routing is derived from `roles` on `GET /me`. The backend must do the
same.

Required:

- Assign roles server-side at signup (or via an admin/invitation flow) and persist them
  where the user cannot write.
- Never read `user_metadata.role` when authorizing a request or populating `GET /me`'s
  `roles` array.
- Reject or ignore any client-supplied role on every write path.

## 2. No payment verification endpoint

**Severity: critical (money correctness).**

`POST /api/v1/leases/{id}/pay` returns a Paystack `checkoutUrl`, but the spec has no
route to verify or read back the result of a specific attempt. There is no
`POST /payments/verify`, no `GET /payments/{reference}`, and no documented webhook
status route.

The frontend callback page currently polls `GET /payments?leaseId=…` and matches on the
most recent record, which is a workaround: it cannot distinguish two attempts on the
same lease in the same polling window, and it cannot tell "still processing" from
"webhook never arrived".

Required, in preference order:

1. `GET /api/v1/payments/{reference}` returning `{ status, amountMinor, currency, leaseId, reference }`
   so the callback page can verify exactly the attempt it started.
2. Or `POST /api/v1/payments/verify` taking `{ reference }` and forcing a Paystack
   verification server-side.

Also: `POST /leases/{id}/pay` should return the payment `reference` (or `intentId`)
alongside `checkoutUrl`. Today only `POST /rent-savings/top-up` returns an `intentId`;
the lease payment route returns `checkoutUrl` and `breakdown` with no handle on the
attempt, so there is nothing stable for the client to verify against.

## 3. No request-side idempotency mechanism

**Severity: high (double charges, double withdrawals).**

`idempotencyKey` appears exactly once in the spec: as a **response** field on
`GET /api/v1/ledger/accounts/{accountId}/transactions` (Super Admin). No endpoint
documents an idempotency request header, query parameter or body field. The spec
declares no header parameters at all.

The frontend sends a conventional `Idempotency-Key: <uuid v4>` header (one UUID per
payment or withdrawal attempt, reused on retry of that same attempt) from
`src/lib/api/http.ts`.

Required:

- Accept and honour `Idempotency-Key` on `POST /leases/{id}/pay`,
  `POST /withdrawals`, `POST /rent-savings/top-up` and
  `POST /wallet/payout-accounts`.
- Document it in the OpenAPI spec as a header parameter.
- Replaying a key must return the original response, not create a second charge.

Until this lands, the header is sent but presumed ignored, and a retried payment can
create a second Paystack transaction.

## 4. Landlords cannot read or decide applications

**Severity: high (feature is dark).**

- `GET /api/v1/applications` is tagged `Applications (Tenant)`. Its description reads
  "Tenants can list their own applications. Admins can list applications for properties
  they are assigned to. Super Admins can list all applications." **LANDLORD is not
  named.** A landlord calling it will most likely receive `403 FORBIDDEN` or an empty
  list.
- Approve and reject exist only at `POST /property-admin/applications/{id}/approve|reject`
  and `POST /super-admin/applications/{id}/approve|reject`. There is no LANDLORD route.

Product decision taken in the frontend: the landlord applications list and detail
screens are **read-only**, and the approve/decline buttons were removed in favour of a
"Reviewed by Vemra" state. This matches the stated product model (Vemra manages
everything between landlords and tenants), but please confirm.

Required if landlords should see their applicants:

- Either extend `GET /api/v1/applications` to scope LANDLORD to applications for
  properties they own, or add `GET /api/v1/properties/me/listings/{propertyId}/applications`.

## 5. Rent changes have no read route

**Severity: medium.**

The lifecycle is write-only from the frontend's point of view:

- `POST /property-admin/leases/{leaseId}/rent-changes` — propose (Property Admin)
- `POST /super-admin/leases/{leaseId}/rent-changes/{requestId}/approve|reject`

There is no `GET` at any path, so neither a tenant nor a landlord can see a pending or
historical rent change. Both screens now render a read-only "coming soon" panel.

Required: `GET /api/v1/leases/{leaseId}/rent-changes` returning the request list with
`status`, `currentRent`, `proposedRent`, `effectiveFrom` and `reason`, readable by the
lease's tenant and the property's landlord.

## 6. Landlord statement export and payment breakdown are Super Admin only

**Severity: medium.**

Every `/api/v1/ledger/**` route is tagged `Ledger (Super Admin)`:

- `GET /ledger/accounts`
- `GET /ledger/accounts/{accountId}/transactions`
- `POST /ledger/accounts/{accountId}/statement-export`
- `GET /ledger/accounts/{accountId}/breakdown`

The landlord statement screen was repointed to `GET /api/v1/wallet`, which does return
`totalBalance` plus per-wallet transactions and covers the balance and statement cases.
It does **not** cover:

- **Statement export** — the export button is disabled with a "coming soon" state.
- **Per-property payment breakdown** — the breakdown screen shows wallet transactions
  and a "coming soon" note.

Required: a non-Super-Admin equivalent, e.g.
`POST /api/v1/wallet/statement-export` and
`GET /api/v1/properties/me/listings/{propertyId}/financials`.

## 7. `bankName` on payout accounts cannot satisfy `bankCode` on withdrawals

**Severity: medium (data model inconsistency).**

- `POST /api/v1/wallet/payout-accounts` accepts `{ bankName, accountNumber }`.
- `POST /api/v1/withdrawals` requires `{ amountMinor, bankCode, accountNumber, accountName }`.

A saved payout account therefore cannot be used to create a withdrawal: it has no
`bankCode` and no `accountName`. The frontend has to ask for bank details a second time
at withdrawal, which is both bad UX and an integrity risk (the two records can diverge).

Required, in preference order:

1. `POST /withdrawals` should accept `{ amountMinor, payoutAccountId }` and resolve bank
   details server-side.
2. Or `POST /wallet/payout-accounts` should accept and store `bankCode` and
   `accountName`, and `GET /wallet/payout-accounts` should return them.

Also: `GET /wallet/payout-accounts` returns `data` as
`{ type: "object", additionalProperties: {} }` — completely untyped. The frontend parses
it defensively with zod. Please publish the real shape.

## 8. Untyped money-bearing response schemas

**Severity: medium (silent breakage).**

These return `additionalProperties: {}` or a bare `{}`, so there is no contract to code
against:

- `GET /me/tenant-dashboard`
- `GET /me/landlord-dashboard`
- `GET /leases` (array of untyped objects)
- `GET /leases/{leaseId}/payment-plan`
- `GET /leases/{leaseId}/deposit`
- `GET /wallet/payout-accounts`
- `GET /me/settings`

The frontend now parses each of these with zod at the API boundary
(`src/lib/api/schemas.ts`) and treats a parse failure as a load error rather than
rendering ₦0. Please publish concrete schemas, with every money field as
`{ amountMinor: string, currency: string }` to match the rest of the spec.

## 9. Success envelope is inconsistent

**Severity: low (already worked around).**

Two shapes are in use:

- `{ data, requestId }` — `/me`, `/payments`, `/wallet`, `/withdrawals`, `/notifications/preferences`, `/leases/{id}/pay`
- `{ status: "success", data }` — `/leases`, `/leases/{leaseId}`, `/leases/{id}/sign`, `/me/settings`, `/wallet/payout-accounts`

And one route returns a bare object with no envelope at all:
`POST /rent-savings/top-up` returns `{ intentId, checkoutUrl, amountMinor, currency }`
at the top level.

The frontend normalises all three in `unwrapData` (`src/lib/api/adapters.ts`). Please
converge on `{ data, requestId }` — `requestId` is what support needs, and the
`status: "success"` variant omits it.

## 10. `GET /properties/{propertyId}` role tag contradicts its own description

**Severity: low.**

The operation is tagged `Requires Role: Tenant` and declares
`security: [{ bearerAuth: [] }]` only, but its description says it "accepts an optional
Bearer token" and that "unauthenticated requests will receive masked location details".
`GET /properties` correctly declares `security: [{ bearerAuth: [] }, {}]`.

Required: add `{}` to the security array on `GET /properties/{propertyId}` so the public
property page can be server-rendered for anonymous visitors, or confirm that anonymous
access is not intended (in which case the public listing page needs a login wall).

## 11. Step-up auth (AAL2) is not enforced server-side

**Severity: high (account takeover → fund theft).**

The frontend now enrols real Supabase TOTP MFA and requires an AAL2 session before
`POST /wallet/payout-accounts` and `POST /withdrawals`. That check is enforced in the
frontend's own server actions by reading the Supabase JWT's `aal` claim.

The backend must enforce it too, otherwise the check is bypassable by calling the API
directly with an AAL1 token.

Required:

- Reject `POST /wallet/payout-accounts`, `POST /wallet/payout-accounts/{id}/primary`
  and `POST /withdrawals` when the Supabase JWT's `aal` claim is not `aal2`, with
  `{ error: { code: "FORBIDDEN" } }` or a dedicated `STEP_UP_REQUIRED` code.
- Add `STEP_UP_REQUIRED` to the `ErrorCode` enum so the frontend can branch on it
  rather than on a message.

## 12. Captcha verification

**Severity: low.**

Cloudflare Turnstile is wired into login, signup and forgot-password via Supabase's
`options.captchaToken`. That is verified by Supabase, not by the Vemra backend, so no
backend change is required for auth. If any `/public/**` write route
(`POST /public/waitlist`, `POST /public/contact`) should be captcha-protected, it needs a
documented token field — there is none today, and both routes are `security: []`.

## 13. KYC status must be reported by `/me` and enforced on protected routes

**Severity: critical (a frontend-only gate is bypassable).**

The frontend now gates listing and renting actions on an approved KYC case
(`requireKycApproved` plus `KycGate`), and reads the status from `GET /kyc/me`
first, falling back to `GET /me` ? `onboarding.kycStatus`. That is a UX guard
only: anyone with a valid token can call the API directly.

Required:

- **A. `/me` should report the real KYC status.** `GET /me` currently may return
  `onboarding.kycStatus: null` even for approved users. It must return the same
  status as `GET /kyc/me` (`PENDING`, `SUBMITTED`, `UNDER_REVIEW`,
  `ACTION_REQUIRED`, `APPROVED`, `REJECTED`, `EXPIRED`) and keep
  `attemptsRemaining` and `applicantMessage` in sync. The frontend treats an
  unknown status as **not approved**, so a null status blocks verified users
  from listing and renting.
- **B. Protected routes should reject unverified users with `403` and
  `error.code = "KYC_REQUIRED"`** (tenant and landlord roles only; staff are
  exempt). At minimum:
  - Landlord: `POST /properties`, `PATCH /properties/{propertyId}`,
    `POST /properties/{propertyId}/publish`,
    `POST /properties/{propertyId}/media/ticket`, and the media
    create/update/delete routes.
  - Tenant: `POST /applications`, `POST /applications/documents/ticket`,
    `POST /leases/{leaseId}/sign`, `POST /leases/{leaseId}/pay`,
    `POST /leases/{leaseId}/payment-plan`, and the deposit decision routes.
  - Add `KYC_REQUIRED` to the `ErrorCode` enum. The frontend already maps it to a
    typed `kycRequired` action failure and redirects to the verification flow.
- **C. `POST /kyc/verify-nin`** returns `{ success: "approve" | "failed" |
  "pending" }`. Document what `pending` means (asynchronous NIN check?) and
  whether the client should then submit documents or poll. The frontend treats
  `approve` and `pending` as �continue to submission�, and `failed` as a
  blocking error.
- **D. `GET /kyc/me`** should remain the source of truth and keep returning
  `status`, `attemptsRemaining`, `applicantMessage`, `decisionReason`,
  `maskedNin`, `decidedAt`, `createdAt`, `updatedAt`. The frontend depends on
  these for the pending and rejected screens (the rejection reason is shown from
  `applicantMessage`/`decisionReason`).
