import { MembershipHub } from "@/components/membership/membership-hub";
import { requireUser } from "@/lib/auth/session";
import {
  getOrgBillingSummary,
  loadRecentLedgerAndRequests,
} from "@/lib/plans/server";

export const metadata = { title: "Plan y Membresía" };

export default async function MembresiaPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const [{ supabase, user, orgId }, params] = await Promise.all([
    requireUser(),
    searchParams,
  ]);

  const [billing, history] = await Promise.all([
    getOrgBillingSummary(supabase, orgId, user.id),
    loadRecentLedgerAndRequests(supabase, orgId),
  ]);

  return (
    <MembershipHub
      billing={billing}
      userEmail={user.email ?? ""}
      ledger={history.ledger}
      requests={history.requests}
      limitBanner={params.limit}
    />
  );
}
