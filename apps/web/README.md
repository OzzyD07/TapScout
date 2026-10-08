# @tapscout/web

Next.js (App Router) app for TapScout: sign-in, build selection, live run timeline and reports,
plus the short API routes (runner callbacks, model relay, maintenance).

```bash
pnpm --filter @tapscout/web dev      # loads the monorepo root .env via dotenv-cli
pnpm --filter @tapscout/web build
```

Sessions use Supabase Auth through `@supabase/ssr`; `src/proxy.ts` refreshes the session and
redirects signed-out visitors to `/login`. Identity is always verified with `getClaims()`.
