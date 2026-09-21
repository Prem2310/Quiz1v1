import { useEffect } from "react";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { usePageMeta } from "@/hooks/usePageMeta";

/** Landing spot after Google/GitHub sign-in: the API redirects here with the session token in the URL fragment. */
export default function AuthCallback() {
  usePageMeta("Signing in · quiz1v1");

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    const home = import.meta.env.BASE_URL;
    if (!token) {
      window.location.replace(`${home}login?error=oauth_failed`);
      return;
    }
    localStorage.setItem("access_token", token);
    // A full load (not a client-side navigation) starts the app from clean state and drops the token from history.
    window.location.replace(home);
  }, []);

  return <BrandLoader label="Signing you in…" />;
}
