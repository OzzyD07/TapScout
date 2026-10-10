import { errorResponse, readJson } from "@/lib/api/errors";
import { createRunsDeps, requireUser } from "@/lib/runs/deps";
import { createRun } from "@/lib/runs/service";

/** Start Test: creates the run atomically and dispatches the device workflow once. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const result = await createRun(createRunsDeps(), user.id, await readJson(request));
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
