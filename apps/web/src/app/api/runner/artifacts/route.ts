import { bearerToken, errorResponse, readJson } from "@/lib/api/errors";
import { presignArtifact } from "@/lib/runner/artifacts";
import { createArtifactDeps } from "@/lib/runner/deps";

/** Records a pending artifact and returns a signed Storage upload URL for a server-chosen path. */
export async function POST(request: Request) {
  try {
    const deps = createArtifactDeps();
    return Response.json(
      await presignArtifact(deps, bearerToken(request), await readJson(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
