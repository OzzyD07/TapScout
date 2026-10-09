import { bearerToken, errorResponse, readJson } from "@/lib/api/errors";
import { completeArtifact } from "@/lib/runner/artifacts";
import { createArtifactDeps } from "@/lib/runner/deps";

/** Marks an artifact ready after checking the object really exists with the stated size. */
export async function POST(request: Request) {
  try {
    const deps = createArtifactDeps();
    return Response.json(
      await completeArtifact(deps, bearerToken(request), await readJson(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
