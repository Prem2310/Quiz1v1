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

export default function Signup() {
  usePageMeta("Sign up free · quiz1v1");
  const { signup, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ name: "", email: "", username: "", password: "", college_name: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (isAuthenticated) navigate("/", { replace: true });
  }, [isAuthenticated, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await signup({
        name: form.name,
        email: form.email,
        username: form.username,
        password: form.password,
        college_name: form.college_name || undefined,
      });
      toast({ title: "Account created", description: `Welcome to quiz1v1, ${user.name.split(" ")[0]}.` });
    } catch (err) {
      const message = getErrorMessage(err, "Could not create your account. Please try again.");
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Practice for free, then challenge someone to a duel."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} required minLength={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={form.username} onChange={(e) => update("username", e.target.value)} required minLength={3} pattern="[a-zA-Z0-9_]+" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="college_name">College / university (optional)</Label>
          <Input id="college_name" value={form.college_name} onChange={(e) => update("college_name", e.target.value)} placeholder="For the college leaderboard" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            required
            minLength={8}
          />
        </div>
        {error ? (
          <p role="alert" className="border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
