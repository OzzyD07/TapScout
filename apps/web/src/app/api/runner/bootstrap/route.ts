import { bearerToken, errorResponse, readJson } from "@/lib/api/errors";
import { createRunnerDeps } from "@/lib/runner/deps";
import { bootstrap } from "@/lib/runner/service";

/** A workflow job proves its identity with its GitHub OIDC token and receives a session lease. */
export async function POST(request: Request) {
  try {
    const result = await bootstrap(
      createRunnerDeps(),
      bearerToken(request),
      await readJson(request),
    );
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
