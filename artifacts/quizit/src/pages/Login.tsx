import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useAuth } from "@/stores/auth";

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Navigate only once the auth context has the user; navigating right after login()
  // renders /arena before the cache update propagates and bounces back to /login.
  useEffect(() => {
    if (isAuthenticated) navigate("/arena", { replace: true });
  }, [isAuthenticated, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login({ email_or_username: emailOrUsername, password });
      toast({ title: "Logged in", description: `Welcome back, ${user.name.split(" ")[0]}!` });
    } catch (err) {
      const message = getErrorMessage(err, "Could not sign in. Check your details and try again.");
      setError(message);
      toast({ title: "Login failed", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Log in to QuizIt"
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
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full glow-primary" disabled={submitting}>
          {submitting ? "Signing in…" : "Log in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
