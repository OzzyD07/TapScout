import type { Metadata } from "next";

export const metadata: Metadata = { title: "FieldNotes privacy policy" };

/** Public privacy policy of the FieldNotes sample app (linked from its Settings screen). */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">FieldNotes privacy policy</h1>
      <p className="text-muted">
        FieldNotes is the sample app that TapScout tests in its demo runs. It is not a commercial
        product.
      </p>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">What the app stores</h2>
        <p>
          Your name, email address, a short bio and the notes you write. Everything is stored only
          on your device. The app has no server, no account backend and no analytics.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Deleting your data</h2>
        <p>
          Settings → Delete account removes your profile and all notes from the device. Uninstalling
          the app removes them as well.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p>
          Questions about this sample:{" "}
          <a className="underline" href="https://github.com/OzzyD07/TapScout/issues">
            github.com/OzzyD07/TapScout/issues
          </a>
          .
        </p>
      </section>
    </main>
  );
}
