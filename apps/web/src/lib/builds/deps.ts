import "server-only";
import { HttpError } from "@/lib/api/errors";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BuildRecord, BuildsDeps } from "./service";

/** Supabase Free plan file limit; set STORAGE_BUILDS_MAX_BYTES after raising the bucket limit. */
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

export function createBuildsDeps(): BuildsDeps {
  const admin = createAdminClient();
  const bucket = () => admin.storage.from(serverEnv.storageBuildsBucket());
  const fail = (what: string) => new HttpError(500, "internal", `could not ${what}`);
  return {
    maxBytes: Number(process.env.STORAGE_BUILDS_MAX_BYTES) || DEFAULT_MAX_BYTES,
    newId: () => crypto.randomUUID(),
    now: () => new Date(),
    async countPending(ownerId) {
      const { count, error } = await admin
        .from("app_builds")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .eq("validation_status", "awaiting_upload")
        // An upload URL lives 2 hours; older pending rows no longer block new uploads.
        .gt("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
      if (error) throw fail("count uploads");
      return count ?? 0;
    },
    async insertBuild(row) {
      const { error } = await admin.from("app_builds").insert({
        id: row.id,
        owner_id: row.ownerId,
        platform: row.platform,
        app_name: row.appName,
        file_name: row.fileName,
        content_type: row.contentType,
        size_bytes: row.sizeBytes,
        staging_key: row.stagingKey,
      });
      if (error) throw fail("record the build");
    },
    async signUpload(key) {
      const { data, error } = await bucket().createSignedUploadUrl(key);
      if (error || !data?.signedUrl) throw fail("create the upload URL");
      return data.signedUrl;
    },
    async loadBuild(id) {
      const { data } = await admin
        .from("app_builds")
        .select("id, owner_id, platform, size_bytes, staging_key, validation_status")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        ownerId: data.owner_id,
        platform: data.platform,
        sizeBytes: Number(data.size_bytes),
        stagingKey: data.staging_key,
        status: data.validation_status,
      } as BuildRecord;
    },
    async objectSize(key) {
      const slash = key.lastIndexOf("/");
      const { data, error } = await bucket().list(key.slice(0, slash), {
        search: key.slice(slash + 1),
      });
      if (error) throw fail("read the upload");
      const file = data?.find((f) => f.name === key.slice(slash + 1));
      const size = (file?.metadata as { size?: number } | null)?.size;
      return typeof size === "number" ? size : null;
    },
    async objectHead(key, bytes) {
      const { data, error } = await bucket().createSignedUrl(key, 60);
      if (error || !data?.signedUrl) throw fail("read the upload");
      const res = await fetch(data.signedUrl, { headers: { range: `bytes=0-${bytes - 1}` } });
      if (!res.ok) throw fail("read the upload");
      return new Uint8Array(await res.arrayBuffer()).slice(0, bytes);
    },
    async moveObject(from, to) {
      const { error } = await bucket().move(from, to);
      if (error) throw fail("store the build");
    },
    async removeObject(key) {
      await bucket().remove([key]);
    },
    async markUploaded(id, objectKey) {
      const { error } = await admin
        .from("app_builds")
        .update({ object_key: objectKey, validation_status: "uploaded" })
        .eq("id", id)
        .eq("validation_status", "awaiting_upload");
      if (error) throw fail("update the build");
    },
    async markRejected(id, reason) {
      await admin
        .from("app_builds")
        .update({ validation_status: "rejected", rejection_reason: reason.slice(0, 400) })
        .eq("id", id);
    },
  };
}
