import type { Metadata } from "next";
import { Logo } from "@/components/ui";

export const metadata: Metadata = { title: "FieldNotes privacy policy" };

const SECTIONS = [
  {
    title: "What the app stores",
    body: "Your name, email address, a short bio and the notes you write. Everything is stored only on your device. The app has no server, no account backend and no analytics.",
  },
  {
    title: "Deleting your data",
    body: "Settings → Delete account removes your profile and all notes from the device. Uninstalling the app removes them as well.",
  },
];

/** Public privacy policy of the FieldNotes sample app (linked from its Settings screen). */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-10 px-4 py-12">
      <Logo />
      <header className="flex flex-col gap-3 border-b border-border pb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">Sample app</p>
        <h1 className="text-3xl font-semibold tracking-tight">FieldNotes privacy policy</h1>
        <p className="text-muted">
          FieldNotes is the sample app that TapScout tests in its demo runs. It is not a commercial
          product.
        </p>
      </header>
      {SECTIONS.map((s) => (
        <section key={s.title} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{s.title}</h2>
          <p className="leading-relaxed text-muted">{s.body}</p>
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Contact</h2>
        <p className="leading-relaxed text-muted">
          Questions about this sample:{" "}
          <a
            className="font-medium text-accent underline-offset-4 hover:underline"
            href="https://github.com/OzzyD07/TapScout/issues"
          >
            github.com/OzzyD07/TapScout/issues
          </a>
          .
        </p>
      </section>
    </main>
  );
}
