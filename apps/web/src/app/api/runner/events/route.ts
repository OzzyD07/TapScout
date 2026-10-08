import { bearerToken, errorResponse, readJson } from "@/lib/api/errors";
import { createRunnerDeps } from "@/lib/runner/deps";
import { appendEvents } from "@/lib/runner/service";

/** Idempotent event batch; the database assigns the per-session sequence used by the live UI. */
export async function POST(request: Request) {
  try {
    const deps = createRunnerDeps();
    return Response.json(await appendEvents(deps, bearerToken(request), await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
