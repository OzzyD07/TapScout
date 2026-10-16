import { errorResponse, HttpError } from "@/lib/api/errors";
import { createReconcileDeps } from "@/lib/reconcile/deps";
import { isCronAuthorized, reconcile } from "@/lib/reconcile/service";

export const maxDuration = 60;

/** Supabase Cron maintenance call (docs/02 §7), authenticated with CRON_AUTH_SECRET. */
export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_AUTH_SECRET)) {
      throw new HttpError(401, "unauthorized", "invalid maintenance token");
    }
    return Response.json(await reconcile(createReconcileDeps()));
  } catch (error) {
    return errorResponse(error);
  }
}
