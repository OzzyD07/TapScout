import { errorResponse, HttpError } from "@/lib/api/errors";
import { createBuildsDeps } from "@/lib/builds/deps";
import { completeBuildUpload } from "@/lib/builds/service";
import { requireUser } from "@/lib/runs/deps";

/** Checks the uploaded file and makes the build available for Start Test. */
export async function POST(_request: Request, ctx: RouteContext<"/api/builds/[id]/complete">) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "not_found", "build not found");
    return Response.json(await completeBuildUpload(createBuildsDeps(), user.id, id));
  } catch (error) {
    return errorResponse(error);
  }
}
