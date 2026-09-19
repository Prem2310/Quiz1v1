import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Logo } from "@/components/brand/Logo";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  /** @deprecated no longer rendered — the heading carries its own weight */
  eyebrow?: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative w-full max-w-md"
      >
        <div className="mb-6 flex justify-center">
          <Link href="/" aria-label="Go to homepage">
            <Logo />
          </Link>
        </div>
        <div className="border-2 border-border bg-surface p-6 sm:p-8">
          <h1 className="font-display text-3xl uppercase tracking-wide text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>
      </motion.div>
    </main>
  );
}
