import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">TapScout</h1>
        <p className="text-muted">
          Autonomous QA for Android and iOS apps. Sign in with the account you were given.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <LoginForm next={next} />
      </div>
      <p className="text-xs text-muted">
        Accounts are created by the TapScout team; public sign-up is disabled.
      </p>
    </main>
  );
}
