import type { UiElement } from "@tapscout/shared";
import { describe, expect, it } from "vitest";
import { AccessTracker, gateOf } from "../src/access.js";
import type { NormalizedScreen } from "../src/observer.js";

let n = 0;
const el = (over: Partial<UiElement>): UiElement =>
  ({
    ref: `el-${++n}`,
    role: "text",
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    enabled: true,
    visible: true,
    ...over,
  }) as UiElement;

const screen = (title: string, elements: UiElement[]) =>
  ({
    title,
    elements,
    keyboardVisible: false,
    dialogVisible: false,
  }) as unknown as NormalizedScreen;

const password = el({ role: "text_field", label: "Password", masked: true });
const email = el({ role: "text_field", label: "E-mail" });

describe("gateOf", () => {
  it("recognises sign-in, one-time code and CAPTCHA walls", () => {
    expect(
      gateOf(screen("Log in", [email, password, el({ role: "button", label: "Sign in" })])),
    ).toBe("sign_in");
    expect(
      gateOf(screen("Verify", [el({ text: "Enter the 6-digit code we sent by SMS" }), email])),
    ).toBe("one_time_code");
    expect(gateOf(screen("Check", [el({ text: "I'm not a robot" })]))).toBe("captcha");
  });

  it("calls a password form with an optional two-factor field a sign-in (a306bbdb, Jerboa)", () => {
    const totp = el({ role: "text_field", label: "TOTP 2FA token" });
    const login = el({ role: "button", text: "Login" });
    expect(gateOf(screen("Login", [email, password, totp, login]))).toBe("sign_in");
  });

  it("recognises a sign-in that starts without a password (f142b47c, Tusky)", () => {
    const instance = el({ role: "text_field", label: "Which instance?" });
    const go = el({ role: "button", text: "Login with Tusky" });
    const t = new AccessTracker();
    expect(
      t.observe(
        "Login",
        screen("Login", [instance, go, el({ role: "link", text: "What's an instance?" })]),
        "s",
      ),
    ).toBe("sign_in");
    expect(t.blockers(false)[0]).toMatch(
      /^Sign-in required: "Login" asks to sign in and no test account/,
    );
    // A search screen with a "Log in" link among many controls is no wall.
    const search = el({ role: "text_field", label: "Search" });
    const many = Array.from({ length: 7 }, (_, i) => el({ role: "button", text: `Item ${i}` }));
    expect(
      gateOf(screen("Home", [search, el({ role: "button", text: "Log in" }), ...many])),
    ).toBeNull();
  });

  it("does not take a change-password form or a plain form for a wall", () => {
    expect(gateOf(screen("Security", [el({ text: "Change password" }), password]))).toBeNull();
    expect(
      gateOf(screen("Create profile", [email, el({ role: "button", label: "Continue" })])),
    ).toBeNull();
  });
});

describe("AccessTracker", () => {
  const login = screen("Log in", [email, password]);

  it("counts a forward step as passing, but not forgot-password or back", () => {
    const t = new AccessTracker();
    t.observe("Log in", login, "shot");
    const forgot = el({ role: "link", text: "Forgot password?" });
    expect(
      t.noteTransition({
        fromLabel: "Log in",
        toLabel: "Reset",
        toIsGate: false,
        type: "tap",
        target: forgot,
      }),
    ).toBe(false);
    expect(
      t.noteTransition({ fromLabel: "Log in", toLabel: "Home", toIsGate: false, type: "back" }),
    ).toBe(false);
    expect(t.blockers(false)[0]).toMatch(/^Sign-in required/);
    // Without the account, a link to the server's rules leads on but not past the sign-in
    // (benchmark run 5cf50571, Tusky on mastodon.social).
    const rules = el({
      role: "button",
      text: "By logging in you agree to the rules of mastodon.social.",
    });
    expect(
      t.noteTransition({
        fromLabel: "Log in",
        toLabel: "mastodon.social rules",
        toIsGate: false,
        type: "tap",
        target: rules,
      }),
    ).toBe(false);
    const guest = el({ role: "button", label: "Continue as guest" });
    expect(
      t.noteTransition({
        fromLabel: "Log in",
        toLabel: "Home",
        toIsGate: false,
        type: "tap",
        target: guest,
      }),
    ).toBe(true);
    expect(t.blockers(false)).toEqual([]);
  });

  it("ends the app only for a wall in front of it, not for an optional sign-in inside it", () => {
    const entry = new AccessTracker();
    entry.observe("Welcome", screen("Welcome", []), "s0");
    entry.observe("Log in", login, "s1");
    expect(entry.entryBlocked()).toBe(true);

    // Habo (benchmark run 5f2a097d): the habit list works without an account; only sync needs one.
    const optional = new AccessTracker();
    for (const label of ["Onboarding", "Habits", "Statistics"]) {
      optional.observe(label, screen(label, []), "s");
    }
    optional.observe("Sync sign-in", login, "s4");
    expect(optional.entryBlocked()).toBe(false);
    expect(optional.blockers(false)[0]).toMatch(/^Sign-in required/);
  });

  it("tells a failed sign-in apart from an unused test account", () => {
    const t = new AccessTracker();
    t.observe("Log in", login, "shot");
    expect(t.blockers(true)[0]).toMatch(/^Sign-in not completed/);
    t.noteAccountTyped("Log in");
    expect(t.blockers(true)[0]).toMatch(
      /^Sign-in failed: the provided test account did not get past "Log in"/,
    );
  });

  it("keeps a one-time code wall after a passed sign-in", () => {
    const t = new AccessTracker();
    t.observe("Log in", login, "a");
    t.observe("Verify", screen("Verify", [el({ text: "Enter verification code" }), email]), "b");
    t.noteTransition({
      fromLabel: "Log in",
      toLabel: "Verify",
      toIsGate: true,
      type: "tap",
      target: el({ label: "Sign in" }),
    });
    expect(t.blockers(true).map((b) => b.split(":")[0])).toEqual([
      "Sign-in not completed",
      "Access blocked",
    ]);
  });
});
