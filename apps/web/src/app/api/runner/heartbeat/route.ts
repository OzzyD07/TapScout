import { bearerToken, errorResponse } from "@/lib/api/errors";
import { createRunnerDeps } from "@/lib/runner/deps";
import { heartbeat } from "@/lib/runner/service";

/** Extends the lease, reports cancellation and rotates the runner token. */
export async function POST(request: Request) {
  try {
    return Response.json(await heartbeat(createRunnerDeps(), bearerToken(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
