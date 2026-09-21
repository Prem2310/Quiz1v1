import { Github } from "lucide-react";
import { getGetAuthProvidersQueryKey, useGetAuthProviders } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/config";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3a7.2 7.2 0 0 1-10.7-3.78H1.4v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.36 14.31a7.2 7.2 0 0 1 0-4.62V6.6H1.4a12 12 0 0 0 0 10.8l3.96-3.09Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.4 6.6l3.96 3.09A7.16 7.16 0 0 1 12 4.77Z" />
    </svg>
  );
}

const PROVIDERS = {
  google: { label: "Google", icon: <GoogleMark /> },
  github: { label: "GitHub", icon: <Github className="h-4 w-4" aria-hidden="true" /> },
} as const;

/** "Continue with Google / GitHub". Only providers the API has credentials for are shown, and nothing at all otherwise. */
export function SocialButtons({ verb }: { verb: "Continue" | "Sign up" | "Log in" }) {
  const { data, isPending } = useGetAuthProviders({ query: { queryKey: getGetAuthProvidersQueryKey(), staleTime: 5 * 60_000, retry: false } });
  if (isPending) return null;
  // Production hides a provider until the API has credentials for it. Dev builds always show both, so the buttons
  // can be seen and styled before any OAuth app exists (an unconfigured one just returns to /login with a message).
  const providers = data?.providers?.length ? data.providers : import.meta.env.DEV ? (["google", "github"] as const) : [];
  if (providers.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      {providers.map((name) => (
        <Button key={name} variant="outline" className="w-full" asChild>
          {/* A full navigation, not a fetch: the provider's consent screen has to load in the browser. */}
          <a href={`${API_BASE_URL}/api/auth/oauth/${name}/start`}>
            {PROVIDERS[name].icon} {verb} with {PROVIDERS[name].label}
          </a>
        </Button>
      ))}
      <div className="flex items-center gap-3 pt-1" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="label-micro">or with email</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
