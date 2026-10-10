import { bearerToken, errorResponse, readJson } from "@/lib/api/errors";
import { createRelayDeps } from "@/lib/relay/deps";
import { relayPlan } from "@/lib/relay/service";

export const maxDuration = 60;

/** Nemotron planner relay: runner token → lease check → budget reservation → one model call. */
export async function POST(request: Request) {
  try {
    return Response.json(
      await relayPlan(createRelayDeps(), bearerToken(request), await readJson(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
