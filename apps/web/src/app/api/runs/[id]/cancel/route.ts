import { errorResponse } from "@/lib/api/errors";
import { createRunsDeps, requireUser } from "@/lib/runs/deps";
import { cancelRun } from "@/lib/runs/service";

export async function POST(_request: Request, { params }: RouteContext<"/api/runs/[id]/cancel">) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return Response.json(await cancelRun(createRunsDeps(), user.id, id));
  } catch (error) {
    return errorResponse(error);
  }
}
