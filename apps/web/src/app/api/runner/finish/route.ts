import { bearerToken, errorResponse, readJson } from "@/lib/api/errors";
import { createRunnerDeps } from "@/lib/runner/deps";
import { finishSession } from "@/lib/runner/service";

/** Moves the session to its terminal phase with the platform result; releases the lease. */
export async function POST(request: Request) {
  try {
    const deps = createRunnerDeps();
    return Response.json(await finishSession(deps, bearerToken(request), await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
