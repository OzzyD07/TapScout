import { UPLOAD_LIMITS } from "@tapscout/shared";
import { errorResponse, HttpError } from "@/lib/api/errors";
import { requireUser } from "@/lib/runs/deps";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Evidence for the browser: the artifact is looked up with the user's own session, so RLS decides
 * access (own runs and shared samples, ready artifacts only). Only then a short-lived signed URL
 * is issued. Stored records keep object keys, never signed URLs (docs/02 §6).
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/artifacts/[id]">) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = await createClient();
    const { data: artifact } = await supabase
      .from("artifacts")
      .select("object_key")
      .eq("id", id)
      .maybeSingle();
    if (!artifact) throw new HttpError(404, "not_found", "artifact not found");

    const { data, error } = await createAdminClient()
      .storage.from(serverEnv.storageEvidenceBucket())
      .createSignedUrl(artifact.object_key, UPLOAD_LIMITS.signedDownloadUrlSeconds);
    if (error || !data) throw new HttpError(500, "internal", "could not sign the artifact");

    return new Response(null, {
      status: 302,
      headers: {
        location: data.signedUrl,
        "cache-control": `private, max-age=${UPLOAD_LIMITS.signedDownloadUrlSeconds - 60}`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
