import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuth } from "@/stores/auth";

export default function Login() {
  usePageMeta("Log in · quiz1v1");
  const { login, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Navigate only once the auth context has the user; navigating right after login()
  // renders the dashboard before the cache update propagates and bounces back to /login.
  useEffect(() => {
    if (isAuthenticated) navigate("/", { replace: true });
  }, [isAuthenticated, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login({ email_or_username: emailOrUsername, password });
      toast({ title: "Logged in", description: `Welcome back, ${user.name.split(" ")[0]}.` });
    } catch (err) {
      const message = getErrorMessage(err, "Could not sign in. Check your details and try again.");
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Log in to quiz1v1"
      subtitle="Pick up your streak and jump back into the arena."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="emailOrUsername">Email or username</Label>
          <Input
            id="emailOrUsername"
            autoComplete="username"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? (
          <p role="alert" className="border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Log in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
