// Access walls (docs/03 §1, §4): a sign-in that needs an account, a one-time code or a CAPTCHA.
// When the session never gets past one, the report says so plainly: the screens behind it were
// not tested, which is different from "no problems found".

import type { UiElement } from "@tapscout/shared";
import type { NormalizedScreen } from "./observer.js";

export type GateKind = "sign_in" | "one_time_code" | "captcha";

const SIGN_IN =
  /\b(log ?in|sign ?in|login|signin|sign ?up|register|create (?:an )?account|password|passcode|giriş|oturum aç|şifre)\b/i;
/** A password field on these screens changes an existing password; it is no wall. */
const CHANGE_PASSWORD = /\b(change|update|current|old) password\b/i;
const ONE_TIME_CODE =
  /\b(verification code|one[- ]time|otp|sms code|security code|confirmation code|enter (?:the )?(?:\d-digit )?code|\d-digit code|2fa|two[- ]factor|authenticator|doğrulama kodu)\b/i;
const CAPTCHA = /captcha|i'?m not a robot|ben robot değilim/i;
/** Taps that leave a sign-in screen sideways rather than through it. */
const SIDE_EXIT =
  /\b(forgot|reset|sign ?up|register|create|help|privacy|terms|policy|back|cancel|close|navigate up)\b/i;

function screenText(screen: NormalizedScreen): string {
  return [screen.title, ...screen.elements.map((e) => `${e.label ?? ""} ${e.text ?? ""}`)]
    .filter(Boolean)
    .join(" ");
}

/** What kind of wall a screen is, if any. */
export function gateOf(screen: NormalizedScreen): GateKind | null {
  const text = screenText(screen);
  const fields = screen.elements.filter((e) => e.role === "text_field");
  if (CAPTCHA.test(text)) return "captcha";
  if (fields.length > 0 && ONE_TIME_CODE.test(text)) return "one_time_code";
  if (fields.some((e) => e.masked) && SIGN_IN.test(text) && !CHANGE_PASSWORD.test(text)) {
    return "sign_in";
  }
  return null;
}

interface Gate {
  kind: GateKind;
  artifactId: string;
  passed: boolean;
  /** The test account was typed on this screen at least once. */
  accountUsed: boolean;
}

export class AccessTracker {
  readonly gates = new Map<string, Gate>();

  observe(screenLabel: string, screen: NormalizedScreen, artifactId: string): GateKind | null {
    const kind = gateOf(screen);
    if (kind && !this.gates.has(screenLabel)) {
      this.gates.set(screenLabel, { kind, artifactId, passed: false, accountUsed: false });
    }
    return kind;
  }

  noteAccountTyped(screenLabel: string): void {
    const gate = this.gates.get(screenLabel);
    if (gate) gate.accountUsed = true;
  }

  /**
   * A gate is passed when an action on it leads forward to a screen that is not a wall itself:
   * a submit after the account was typed, or a tap such as "Continue as guest". Side exits
   * (forgot password, sign up, back) do not count.
   */
  noteTransition(o: {
    fromLabel: string;
    toLabel: string | null;
    toIsGate: boolean;
    type: string;
    target?: UiElement;
  }): boolean {
    const gate = this.gates.get(o.fromLabel);
    if (!gate || gate.passed || !o.toLabel || o.toLabel === o.fromLabel || o.toIsGate) {
      return false;
    }
    if (o.type === "back") return false;
    // Visible names only: ids such as "register-continue" say little about where a tap leads.
    const name = `${o.target?.label ?? ""} ${o.target?.text ?? ""}`;
    if (o.type === "tap" && SIDE_EXIT.test(name)) return false;
    if (o.type !== "tap" && o.type !== "type") return false;
    gate.passed = true;
    return true;
  }

  /** Report lines for walls that were never passed. */
  blockers(accountProvided: boolean): string[] {
    const out: string[] = [];
    // Once one sign-in screen was passed, sibling ones (sign up, a second login) are no wall.
    const signedIn = [...this.gates.values()].some((g) => g.kind === "sign_in" && g.passed);
    for (const [label, gate] of this.gates) {
      if (gate.passed || (signedIn && gate.kind === "sign_in")) continue;
      const screen = JSON.stringify(label);
      if (gate.kind === "captcha") {
        out.push(
          `Access blocked: ${screen} shows a CAPTCHA, which TapScout does not solve. The screens behind it were not tested.`,
        );
      } else if (gate.kind === "one_time_code") {
        out.push(
          `Access blocked: ${screen} asks for a one-time code (SMS, e-mail or authenticator), which TapScout cannot receive. The screens behind it were not tested.`,
        );
      } else if (!accountProvided) {
        out.push(
          `Sign-in required: ${screen} asks for a password and no test account was provided, so the screens behind sign-in were not tested. Add a test account to the build to test them.`,
        );
      } else {
        out.push(
          gate.accountUsed
            ? `Sign-in failed: the provided test account did not get past ${screen}. The screens behind sign-in were not tested.`
            : `Sign-in not completed: the test account was not used on ${screen} before the session ended. The screens behind sign-in were not tested.`,
        );
      }
    }
    return out;
  }
}
