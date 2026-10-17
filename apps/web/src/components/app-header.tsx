import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { ExternalIcon, LogOutIcon } from "./icons";
import { buttonClass, Logo } from "./ui";

/** Top bar of every signed-in page. */
export function AppHeader({ email }: { email?: string | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-5">
          <Link href="/" aria-label="TapScout home" className="rounded-md">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 text-sm sm:flex">
            <Link href="/" className={buttonClass("ghost", "sm")}>
              Tests
            </Link>
            <a
              href="https://github.com/OzzyD07/TapScout"
              target="_blank"
              rel="noreferrer"
              className={buttonClass("ghost", "sm")}
            >
              Source <ExternalIcon size={13} />
            </a>
          </nav>
        </div>
        <form action={signOut} className="flex items-center gap-3">
          {email ? (
            <span className="hidden max-w-56 truncate text-xs text-muted md:inline">{email}</span>
          ) : null}
          <button type="submit" className={buttonClass("secondary", "sm")}>
            <LogOutIcon size={14} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </form>
      </div>
    </header>
  );
}
