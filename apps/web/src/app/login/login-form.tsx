"use client";

import { useActionState } from "react";
import { AlertIcon } from "@/components/icons";
import { buttonClass, inputClass } from "@/components/ui";
import { type LoginState, signIn } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, initialState);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className={`${inputClass} h-10`}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={`${inputClass} h-10`}
        />
      </label>
      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          <AlertIcon size={15} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`${buttonClass("primary")} mt-1 w-full`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
