import { errorResponse, readJson } from "@/lib/api/errors";
import { createBuildsDeps } from "@/lib/builds/deps";
import { createBuildUpload } from "@/lib/builds/service";
import { requireUser } from "@/lib/runs/deps";

/** Records a user build and returns a signed URL the browser uploads the file to. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const result = await createBuildUpload(createBuildsDeps(), user.id, await readJson(request));
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
