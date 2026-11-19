"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isUniversityEmail } from "@/lib/validation";

// Set NEXT_PUBLIC_GOOGLE_SIGNIN=1 once the Google provider is switched on in Supabase.
// Until then the button stays hidden, because pressing it would only show an error.
const GOOGLE_SIGNIN = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "1";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Coming back from a failed Google sign-in: say what happened.
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason === "not_nyu") setError("That Google account is not an NYU one. Pick your @nyu.edu account, or use an email code.");
    else if (reason === "google") setError("Google sign-in did not finish. Try again, or use an email code.");
  }, []);

  // Google sign-in for NYU accounts: no code to wait for. `hd` asks Google to offer only
  // nyu.edu accounts; the database still checks the domain, so it is a convenience, not the
  // security.
  async function signInWithGoogle() {
    setError(null);
    setBusy(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: "nyu.edu", prompt: "select_account" },
      },
    });
    if (error) {
      setBusy(false);
      setError("Google sign-in is not available right now. Use an email code.");
    }
    // On success the browser leaves for Google, so there is nothing more to do here.
  }

  // Remember the address on this device so signing back in is one tap plus the code.
  useEffect(() => {
    const saved = window.localStorage.getItem("tunedin:last-email");
    if (saved) setEmail(saved);
  }, []);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const address = email.trim().toLowerCase();
    if (!isUniversityEmail(address)) {
      setError("TunedIn is NYU-only for now. Use your @nyu.edu email.");
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.signInWithOtp({ email: address });
    setBusy(false);
    if (error) {
      // Supabase has two different limits that both answer 429. Tell them apart so the
      // message says what to actually do.
      if (error.code === "over_email_send_rate_limit" && /seconds/i.test(error.message)) {
        // One code per address per minute: a code was very likely already sent.
        setEmail(address);
        setStep("code");
        setError("We just sent a code to this address. Check your inbox and spam, or wait a minute to get a new one.");
      } else if (error.status === 429) {
        setError("TunedIn is sending too many emails right now. Try again in a few minutes.");
      } else {
        setError("We could not send a code to that address. Check it and try again.");
      }
      console.warn("sign-in code request failed:", error.status, error.code, error.message);
      return;
    }
    window.localStorage.setItem("tunedin:last-email", address);
    setEmail(address);
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await createClient().auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) {
      setError("That code is wrong or has expired. Check it or ask for a new one.");
      return;
    }
    router.replace("/home");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-bold">TunedIn</h1>

      {step === "email" && GOOGLE_SIGNIN && (
        <>
          <button type="button" onClick={signInWithGoogle} disabled={busy} className="btn">
            Continue with your NYU Google account
          </button>
          <p className="-my-2 text-center text-xs opacity-50">or get a code by email</p>
        </>
      )}

      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm opacity-80">
            Your NYU email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="netid@nyu.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
          <button type="submit" disabled={busy} className="btn">
            {busy ? "Sending..." : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <label htmlFor="code" className="text-sm opacity-80">
            Enter the 6-digit code we sent to {email}
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="123456"
            value={code}
            // Digits only. Codes are 6 digits: "Email OTP Length" must be 6 in the hosted
            // Supabase project (the default there is 8), matching supabase/config.toml.
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="field text-center text-2xl tracking-[0.3em]"
          />
          <button type="submit" disabled={busy} className="btn">
            {busy ? "Checking..." : "Sign in"}
          </button>
          <button
            type="button"
            className="text-sm underline opacity-70"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            Use a different email or resend
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-xs opacity-50">
        By joining you agree to how TunedIn handles your data.{" "}
        <a href="/privacy" className="underline">
          Privacy
        </a>
      </p>
    </main>
  );
}
