import { bearerToken, errorResponse, readJson } from "@/lib/api/errors";
import { createRelayDeps } from "@/lib/relay/deps";
import { relayVision } from "@/lib/relay/service";

export const maxDuration = 60;

/** Vision relay: only a ready screenshot of the caller's own session attempt, never a URL. */
export async function POST(request: Request) {
  try {
    return Response.json(
      await relayVision(createRelayDeps(), bearerToken(request), await readJson(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
