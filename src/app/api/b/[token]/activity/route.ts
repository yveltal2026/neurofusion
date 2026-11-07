import type { NextRequest } from "next/server";
import { handleParticipationActivity } from "@/lib/participation-activity-route";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/b/[token]/activity">,
) {
  return handleParticipationActivity(
    request,
    (await context.params).token,
    "battery",
  );
}
