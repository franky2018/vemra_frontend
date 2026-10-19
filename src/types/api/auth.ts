import type { Iso8601 } from "@/types/api/common";

export type UserRole = "TENANT" | "LANDLORD";

export interface SessionUser {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  roles: readonly UserRole[];
  isEmailVerified: boolean;
  isIdentityVerified: boolean;
}

export interface Session {
  user: SessionUser;
  activeRole: UserRole;
  expiresAt: Iso8601 | null;
}

export type VerificationState =
  | "not_started"
  | "pending"
  | "in_review"
  | "complete"
  | "rejected";

export interface VerificationChecklistItem {
  id: string;
  title: string;
  description: string;
  state: VerificationState;
  status: string | null;
  actionLabel: string | null;
}

export interface VerificationStatus {
  state: VerificationState;
  items: readonly VerificationChecklistItem[];
  submittedAt: Iso8601 | null;
  reviewedAt: Iso8601 | null;
  rejectionReason: string | null;
  estimatedWait: string | null;
}

export interface TwoFactorSetup {
  provisioningUri: string;
  secret: string;
  recoveryCodes: readonly string[];
}

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  isComplete: boolean;
  href: string | null;
}

export interface OnboardingWelcome {
  role: UserRole;
  userName: string;
  steps: readonly OnboardingStep[];
}


export interface LoginPayload {
  email: string;
  password: string;
  role: UserRole;
  remember: boolean;
}

export interface SignupPayload {
  email: string;
  password: string;
  role: UserRole;
  acceptedTerms: boolean;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export interface AuthResult {
  session: Session;
  token: string;
  expiresAt: Iso8601 | null;
}






export type AccountRole =
  | "TENANT"
  | "LANDLORD"
  | "PROPERTY_ADMIN"
  | "SUPER_ADMIN"
  | "SUPPORT";

export type AccountStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";

export type OnboardingNextStep =
  | "EMAIL_VERIFICATION"
  | "KYC_SUBMISSION"
  | "UNDER_REVIEW"
  | "ACTION_REQUIRED"
  | "COMPLETE";


export type KycStatus =
  | "PENDING"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ACTION_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED";

export interface OnboardingState {
  nextStep: OnboardingNextStep;
  kycStatus: KycStatus | null;
  attemptsRemaining: number | null;
  
  applicantMessage: string | null;
}

/** `GET /kyc/me` — the authoritative record of the caller's KYC case. */
export interface KycMe {
  id: string;
  userId: string;
  status: KycStatus;
  attemptsRemaining: number | null;
  applicantMessage: string | null;
  decisionReason: string | null;
  maskedNin: string | null;
  decidedAt: Iso8601 | null;
  createdAt: Iso8601;
  updatedAt: Iso8601;
}

/** Normalised KYC status used across the app, from `/kyc/me` then `/me`. */
export interface KycState {
  approved: boolean;
  kycStatus: KycStatus | null;
  nextStep: OnboardingNextStep;
  attemptsRemaining: number | null;
  applicantMessage: string | null;
}


export interface AccountProfile {
  userId: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  /** Absent rather than null when never set — it is not a required field on `GET /me`. */
  avatarUrl?: string | null;
  phone: string | null;
  handle: string | null;
  roles: readonly AccountRole[];
  accountStatus: AccountStatus;
  onboarding: OnboardingState;
}

export interface ProfileUpdatePayload {
  displayName?: string | null;
  phone?: string | null;
  handle?: string | null;
}



export interface KycDocumentInput {
  checkType: string;

  storagePath: string;
}

export interface KycSubmissionPayload {
  documents: readonly KycDocumentInput[];
  claims: Record<string, string>;
}

export interface KycSubmissionResult {
  id: string;
  status: KycStatus;
}

export interface NinVerificationInput {
  nin: string;
  firstName: string;
  lastName: string;
  dob?: string;
  phone?: string;
  gender?: string;
}

export type NinVerificationOutcome = "approve" | "failed" | "pending";

export interface NinVerificationResult {
  success: NinVerificationOutcome;
}

