import Image from "next/image";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { MediaPreview } from "@/components/media/media-preview";
import { KycGate } from "@/components/kyc/kyc-gate";
import { SavePropertyButton } from "@/features/marketing/save-property-button";
import { cn } from "@/lib/cn";
import { CONTAINER, SECTION_GUTTER } from "@/lib/layout";
import { AUTH_ROUTES } from "@/constants/auth";
import { getKycState, getSession } from "@/lib/api/resources/auth";
import { getListing, getPlatformStats, getPublicProfile } from "@/lib/api/resources/public";
import { formatDate, formatRent } from "@/lib/format";

const applicationSteps = [
  ["1", "Apply through Vemra", "Tenants submit their application and required details through Vemra."],
  ["2", "Vemra verifies and reviews", "Vemra verifies the information and reviews the application before moving it forward."],
  ["3", "Decision is communicated", "Vemra shares the decision through the assigned Property Admin or Support."],
  ["4", "Lease is sent through Vemra", "Approved tenants receive the lease through Vemra for the next step."],
] as const;

export async function ListingDetailScreen({ listingId }: { listingId: string }) {
  const [listing, session] = await Promise.all([
    getListing(listingId),
    getSession(),
  ]);
  const canSave = session?.user.roles.includes("TENANT") === true;
  const kyc = canSave ? await getKycState() : null;
  if (!listing) {
    return <div className={cn(CONTAINER, SECTION_GUTTER, "py-20 text-center")}><h1 className="text-heading-md font-bold">Listing not found</h1><p className="mt-2 text-body-md text-neutral-700">This home may no longer be available.</p><Link href="/browse" className={buttonClasses({ size: "sm", className: "mt-6" })}>Browse rentals</Link></div>;
  }
  const detailStats = listing.stats.length > 0 ? listing.stats.map(({ value, label }) => [value, label] as const) : [
    [String(listing.bedrooms ?? "—"), "Bedrooms"],
    [String(listing.bathrooms ?? "—"), "Bathrooms"],
    [listing.floorArea ?? "—", "Floor area"],
    [formatDate(listing.availableFrom, "short"), "Available from"],
  ] as const;
  return (
    <div className={cn(CONTAINER, SECTION_GUTTER, "py-5 md:py-8 lg:py-6")}>
      <p className="mb-5 text-caption text-neutral-700">Browse rentals&nbsp; / &nbsp;{listing.location}</p>
      <div className="grid gap-6 lg:grid-cols-[1fr_242px]">
        <div>
          <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
            <MediaPreview url={listing.photos[0]?.url ?? "/marketing/listing-maple-9th.png"} alt={listing.photos[0]?.alt ?? ""} width={800} height={560} controls className="h-full min-h-60 w-full rounded-lg bg-neutral-900 object-cover md:row-span-2" />
            <MediaPreview url={listing.photos[1]?.url ?? listing.photos[0]?.url ?? "/marketing/listing-maple-9th-2.png"} alt={listing.photos[1]?.alt ?? ""} width={400} height={220} controls className="h-32 w-full rounded-lg bg-neutral-900 object-cover md:h-full" />
            <MediaPreview url={listing.photos[2]?.url ?? listing.photos[0]?.url ?? "/marketing/listing-maple-9th-3.png"} alt={listing.photos[2]?.alt ?? ""} width={400} height={220} controls className="h-32 w-full rounded-lg bg-neutral-900 object-cover md:h-full" />
          </div>
          <div className="mt-5 flex items-start justify-between border-b border-neutral-200 pb-5">
            <div><h1 className="font-display text-heading-lg font-bold text-neutral-900">{listing.title}</h1><p className="text-body-sm text-neutral-700">{listing.location}</p></div>
            <p className="text-right font-display text-heading-md font-bold text-brand-700">{formatRent(listing.rent, listing.rentPeriod)}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 border-b border-neutral-200 py-6 md:grid-cols-4">
            {detailStats.map(([value, label]) => <div key={label} className="border-r border-neutral-200 last:border-0"><p className="font-display text-body-lg font-bold text-neutral-900">{value}</p><p className="text-caption text-neutral-700">{label}</p></div>)}
          </div>
          <section className="border-b border-neutral-200 py-6"><h2 className="text-heading-sm font-bold">About this home</h2><p className="mt-3 text-body-sm text-neutral-700">{listing.description}</p></section>
          <section className="border-b border-neutral-200 py-6"><h2 className="text-heading-sm font-bold">How applications work</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{applicationSteps.map(([number, title, copy]) => <article key={number} className="rounded-lg border border-neutral-200 p-3"><span className="inline-flex size-5 items-center justify-center rounded-full bg-brand-700 text-caption font-bold text-white">{number}</span><h3 className="mt-2 text-label-md font-bold">{title}</h3><p className="mt-2 text-caption text-neutral-700">{copy}</p></article>)}</div></section>
          <section className="py-6"><h2 className="text-heading-sm font-bold">Amenities</h2><ul className="mt-3 grid grid-cols-2 gap-2 text-body-sm text-neutral-700">{listing.amenities.map((amenity) => <li key={amenity}>• {amenity}</li>)}</ul></section>
        </div>
        <aside className="h-fit overflow-hidden rounded-lg border border-neutral-200"><div className="bg-[#003e48] px-4 py-3 text-label-sm text-white">◯ &nbsp;{listing.isVerified ? "Landlord verified" : "Vemra listing"}</div><div className="space-y-4 p-4">{listing.contact ? <div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-lg bg-brand-700 text-label-sm text-white">{listing.contact.initials}</span><div><p className="text-label-sm font-bold">{listing.contact.name}</p><p className="text-caption text-neutral-700">{listing.contact.role} · manages this property only</p></div></div> : null}<dl className="space-y-3 border-t border-neutral-200 pt-4 text-caption"><div className="flex justify-between"><dt>Owned by</dt><dd className="font-semibold">{listing.owner?.name ?? "—"}</dd></div><div className="flex justify-between"><dt>On Vemra since</dt><dd className="font-semibold">{listing.owner?.onVemraSince ?? "—"}</dd></div></dl>{canSave ? <KycGate approved={kyc?.approved === true} href={AUTH_ROUTES.signupVerification} label="Apply through Vemra" description="Complete identity verification before applying for a home."><Link href={`/tenant/apply?propertyId=${listing.id}`} className={buttonClasses({ size: "sm", fullWidth: true })}>Apply through Vemra</Link></KycGate> : <Link href="/signup" className={buttonClasses({ size: "sm", fullWidth: true })}>Apply through Vemra</Link>}{canSave ? <SavePropertyButton propertyId={listing.id} /> : null}{listing.contact ? <Link href={`/profile/${listing.contact.id}`} className={buttonClasses({ size: "sm", variant: "secondary", fullWidth: true })}>Contact Property Admin</Link> : null}</div></aside>
      </div>
    </div>
  );
}

export function EmptySearchScreen() {
  return <div className={cn(CONTAINER, SECTION_GUTTER, "py-10 md:py-12")}><div className="rounded-lg border border-neutral-200 p-4"><div className="flex flex-wrap items-center gap-2 text-caption"><strong>Active filters:</strong>{["Under ₦900/yr", "3+ bedrooms", "Riverside Court"].map((filter, i) => <span key={filter} className={cn("rounded-full border px-3 py-1", i === 0 && "border-brand-700 bg-brand-700 text-white")}>{filter} ×</span>)}</div></div><div className="mx-auto flex max-w-140 flex-col items-center py-20 text-center"><div className="mb-6 flex size-14 items-center justify-center rounded-xl bg-brand-700/5 text-3xl text-brand-700">⌕</div><h1 className="text-heading-md font-bold">No homes match these filters</h1><p className="mt-2 max-w-120 text-body-sm text-neutral-700">There aren&apos;t any verified listings under ₦900/yr with 3+ bedrooms in Riverside Court right now. Try widening your search.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link href="/browse" className={buttonClasses({ size: "sm", variant: "secondary" })}>Clear filters</Link><Link href="/signup" className={buttonClasses({ size: "sm" })}>Get notified of new matches</Link></div></div></div>;
}

export async function AboutContactScreen() {
  const platformStats = await getPlatformStats();
  const stats = platformStats?.stats ?? [];
  return <div className={cn(CONTAINER, SECTION_GUTTER, "py-12 md:py-16")}><div className="mx-auto max-w-140 text-center"><h1 className="font-display text-display-md font-bold">Vemra is your digital Caretaker.</h1><p className="mt-4 text-body-lg font-semibold text-neutral-700">We use technology to simplify the entire rental process as well as post rental landlord-tenant management, reducing fraud, high fees and poor property management.</p></div>{stats.length > 0 ? <div className="my-12 grid grid-cols-3 border-y border-neutral-200 py-6 text-center">{stats.map(({ id, value, label }) => <div key={id}><p className="font-display text-display-sm font-bold text-brand-700">{value}</p><p className="text-caption text-neutral-700">{label}</p></div>)}</div> : null}<h2 className="text-heading-md font-bold">Get in touch</h2><div className="mt-6 grid gap-4 md:grid-cols-3">{[["▢", "General support", "Questions about your account, a listing, or a payment.", "Open a support ticket →"], ["♢", "For landlords", "Partnerships, bulk listings, or property management questions.", "landlords@vemra.com"], ["▤", "Press & media", "Interview requests and media inquiries.", "press@vemra.com"]].map(([icon, title, copy, action]) => <article key={title} className="rounded-lg border border-neutral-200 p-5 shadow-elevation-3"><span className="text-xl text-brand-700">{icon}</span><h3 className="mt-4 text-heading-sm font-bold">{title}</h3><p className="mt-4 text-body-sm text-neutral-700">{copy}</p><p className="mt-4 text-label-sm font-semibold text-brand-700">{action}</p></article>)}</div></div>;
}

export function RoleMarketingScreen({ role }: { role: "landlord" | "tenant" }) {
  const landlord = role === "landlord";
  return <div className={cn(CONTAINER, SECTION_GUTTER, "py-12 md:py-16")}><div className="mx-auto max-w-140"><p className="text-label-sm font-semibold uppercase tracking-wide text-brand-700">For {landlord ? "landlords" : "tenants"}</p><h1 className="mt-3 font-display text-display-md font-bold">{landlord ? "Keep your rental business clear and accountable." : "Know who holds your keys before you pay."}</h1><p className="mt-4 text-body-lg text-neutral-700">{landlord ? "List your homes, follow occupancy and rent, and work with an assigned Vemra Property Admin when a property needs support." : "Browse verified homes, track rent and payments, and keep every important tenancy update in one place."}</p><div className="mt-8 flex flex-wrap gap-3"><Link href={landlord ? "/list-your-property" : "/browse"} className={buttonClasses({ size: "sm" })}>{landlord ? "List your property" : "Find a home to rent"}</Link><Link href="/signup" className={buttonClasses({ size: "sm", variant: "secondary" })}>Create an account</Link></div></div><div className="mt-12 grid gap-4 md:grid-cols-3">{(landlord ? [["Occupancy overview", "See occupied and vacant units at a glance."], ["Cleared rent", "Know what is ready to withdraw."], ["Property Admin assignment", "Get operational support through Vemra."]] : [["Verified listings", "See who owns and manages a home before you apply."], ["Rent tracking", "Keep due dates and payment history together."], ["One shared record", "Stay aligned with your landlord and Property Admin."]]).map(([heading, copy]) => <article key={heading} className="rounded-lg border border-neutral-200 bg-white p-5"><h2 className="text-heading-sm font-bold">{heading}</h2><p className="mt-2 text-body-sm text-neutral-700">{copy}</p></article>)}</div></div>;
}

export function VerificationScreen() {
  return <div className={cn(CONTAINER, SECTION_GUTTER, "py-12 md:py-16")}><div className="mx-auto max-w-140 text-center"><p className="text-label-sm font-semibold uppercase tracking-wide text-brand-700">Verification</p><h1 className="mt-3 font-display text-display-md font-bold">A verified record before money changes hands.</h1><p className="mt-4 text-body-lg text-neutral-700">Vemra checks identity and listing details, then keeps landlord, tenant, and Property Admin updates in one shared record.</p><Link href="/signup" className={buttonClasses({ size: "sm", className: "mt-8" })}>Create an account</Link></div></div>;
}

export function SupportScreen() {
  return <div className={cn(CONTAINER, SECTION_GUTTER, "py-12 md:py-16")}><div className="mx-auto max-w-140"><h1 className="font-display text-display-md font-bold">How can we help?</h1><p className="mt-4 text-body-lg text-neutral-700">Contact Vemra Support for questions about your account, a listing, a payment, or a Property Admin update.</p><section className="mt-8 rounded-lg border border-neutral-200 bg-white p-6"><h2 className="text-heading-sm font-bold">Open a support request</h2><p className="mt-2 text-body-sm text-neutral-700">Sign in so we can securely connect your request to the right property or tenancy record.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/login" className={buttonClasses({ size: "sm" })}>Log in to get support</Link><Link href="/about" className={buttonClasses({ size: "sm", variant: "secondary" })}>Contact Vemra</Link></div></section></div></div>;
}

export async function ProfileScreen({ profileId }: { profileId: string }) {
  const profile = await getPublicProfile(profileId);
  if (!profile) {
    return <div className={cn(CONTAINER, SECTION_GUTTER, "py-20 text-center")}><h1 className="text-heading-md font-bold">Profile not found</h1><p className="mt-2 text-body-md text-neutral-700">This Property Admin profile is unavailable.</p><Link href="/browse" className={buttonClasses({ size: "sm", className: "mt-6" })}>Browse rentals</Link></div>;
  }
  return <div className={cn(CONTAINER, SECTION_GUTTER, "py-8")}><section className="flex flex-col gap-5 rounded-lg border border-neutral-200 p-5 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-4"><Image src={profile.avatarUrl ?? "/marketing/profile-priya.png"} alt={profile.name} width={64} height={64} className="size-16 rounded-xl object-cover" /><div><h1 className="text-heading-md font-bold">{profile.name}{profile.isVerified ? <span className="text-label-sm text-brand-700"> Verified</span> : null}</h1><p className="text-body-sm text-neutral-700">{profile.role}{profile.area ? ` · ${profile.area}` : ""}</p></div></div><div className="flex gap-3"><Link href="/browse" className={buttonClasses({ size: "sm", variant: "secondary" })}>Browse listings</Link><Link href="/browse" className={buttonClasses({ size: "sm" })}>View listings</Link></div></section>{profile.stats.length > 0 ? <section className="my-7 grid grid-cols-2 gap-4 rounded-lg border border-neutral-200 p-5 md:grid-cols-4">{profile.stats.map(({ label, value }) => <div key={label}><p className="font-display text-heading-md font-bold text-brand-700">{value}</p><p className="text-caption text-neutral-700">{label}</p></div>)}</section> : null}<section className="rounded-lg border border-neutral-200 p-5"><h2 className="text-heading-md font-bold">About</h2><p className="mt-3 text-body-sm text-neutral-700">{profile.bio}</p></section>{profile.managedListings.length > 0 ? <><h2 className="mt-8 text-heading-md font-bold">Currently managing</h2><div className="mt-4 grid gap-4 md:grid-cols-3">{profile.managedListings.map((listing) => <Link href={`/properties/${listing.id}`} key={listing.id} className="overflow-hidden rounded-lg border border-neutral-200"><Image src={listing.coverImage?.url ?? "/marketing/listing-maple-9th.png"} alt={listing.coverImage?.alt ?? ""} width={400} height={180} className="h-32 w-full object-cover" /><div className="p-3"><p className="font-display text-body-lg font-bold text-brand-700">{formatRent(listing.rent, listing.rentPeriod)}</p><p className="text-body-sm">{listing.location}</p><p className="text-caption text-neutral-700">• {listing.isAvailableNow ? "Available now" : "Occupied"}</p></div></Link>)}</div></> : null}</div>;
}
