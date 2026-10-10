import { bearerToken, errorResponse, readJson } from "@/lib/api/errors";
import { createReportDeps } from "@/lib/report/deps";
import { reportRun } from "@/lib/report/service";

/** qa-run report job: GitHub OIDC → close orphaned sessions → report lease → deterministic report. */
export async function POST(request: Request) {
  try {
    const result = await reportRun(
      createReportDeps(),
      bearerToken(request),
      await readJson(request),
    );
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
