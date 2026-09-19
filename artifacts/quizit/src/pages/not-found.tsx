import { Link } from "wouter";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius)] border border-border bg-card text-primary">
        <Compass className="h-6 w-6" />
      </div>
      <h1 className="font-display text-3xl font-bold text-foreground">Lost the plot</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page doesn't exist. Let's get you back to solving questions instead.
      </p>
      <Link href="/">
        <Button className="mt-2">Back to QuizIt</Button>
      </Link>
    </div>
  );
}
