import { useState, type FormEvent } from "react";
import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Reveal } from "@/components/common/Motion";
import { Button } from "@/components/ui/button";
import { CollegePicker } from "@/components/auth/CollegePicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";
import { useAuth } from "@/stores/auth";

export default function Settings() {
  const { user, updateProfile, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [collegeName, setCollegeName] = useState(user?.college_name ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      await updateProfile({ name, username, college_name: collegeName });
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      setStatus("error");
      setError(getErrorMessage(err, "Could not save changes."));
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Settings" description="Update how you appear on the leaderboard." />

      <Reveal>
        <form onSubmit={onSubmit} className="surface-panel space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} pattern="[a-zA-Z0-9_]+" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="college">College / university</Label>
            <CollegePicker key={user?.college_name ?? ""} id="college" value={collegeName} onChange={setCollegeName} />
            <p className="text-xs text-muted-foreground">Sets which college leaderboard you appear on.</p>
          </div>
          {error ? (
            <p role="alert" className="border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save changes"}
          </Button>
        </form>
      </Reveal>

      <Reveal delay={0.08}>
        <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" /> Log out
        </Button>
      </Reveal>
    </div>
  );
}
