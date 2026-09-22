import { useState } from "react";
import { Redirect } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Flame, Swords, Target, Trophy, UserCheck, UserPlus } from "lucide-react";
import { getGetPublicProfileQueryKey, getSendFriendRequestMutationOptions, useGetPublicProfile, type PublicProfile, type UserSummary } from "@workspace/api-client-react";
import { ChallengeDialog } from "@/components/quiz/ChallengeDialog";
import { HeadToHeadPanel } from "@/components/quiz/HeadToHeadPanel";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateBlocks";
import { Reveal, StaggerGroup } from "@/components/common/Motion";
import { Button } from "@/components/ui/button";
import { Stat } from "@/pages/Profile";
import { initialsOf } from "@/components/layout/AppShell";
import { leagueProgress } from "@/lib/leagues";
import { getErrorMessage, isNotFoundError } from "@/lib/errors";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/stores/auth";

export default function UserProfile({ username }: { username: string }) {
  const { user: me } = useAuth();
  const isSelf = Boolean(me && me.username.toLowerCase() === username.toLowerCase());
  const query = useGetPublicProfile(username, { query: { queryKey: getGetPublicProfileQueryKey(username), enabled: !isSelf } });

  // Your own card already has the full self-view (edit, logout, practice history); this page is for everyone else.
  if (isSelf) return <Redirect to="/profile" replace />;

  if (query.isPending) return <LoadingState label="Loading profile…" />;
  if (query.isError) {
    return isNotFoundError(query.error) ? (
      <EmptyState title="Player not found" message={`No one on quiz1v1 goes by @${username}.`} />
    ) : (
      <ErrorState message="Couldn't load this profile." onRetry={() => void query.refetch()} />
    );
  }

  return <ProfileContent profile={query.data} meName={me?.name ?? "You"} meRating={me?.user_rating} />;
}

function ProfileContent({
  profile,
  meName,
  meRating,
}: {
  profile: PublicProfile;
  meName: string;
  meRating: number | undefined;
}) {
  const [challenging, setChallenging] = useState(false);
  const { next, pct, toNext } = leagueProgress(profile.rating);
  const totalAnswered = profile.total_correct + profile.total_incorrect;
  const opponent: UserSummary = {
    user_id: profile.user_id,
    username: profile.username,
    name: profile.name,
    college_name: profile.college_name,
    rating: profile.rating,
    league: profile.league,
    friend_status: profile.friend_status,
  };

  return (
    <div className="space-y-6">
      <Reveal>
        <header className="glass-panel p-5 sm:p-6">
          {/* Two corners, never blended: you on the left, them on the right — a versus screen, not a bio page. */}
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-[calc(var(--radius)-4px)] border-2 border-primary bg-primary/10 text-sm font-bold text-primary sm:h-14 sm:w-14 sm:text-base">
                {initialsOf(meName)}
              </div>
              <span className="label-micro text-primary">You{meRating != null ? ` · ${Math.round(meRating)}` : ""}</span>
            </div>
            <span className="numeric shrink-0 text-lg font-bold text-muted-foreground sm:text-xl">VS</span>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[calc(var(--radius)-4px)] border-2 border-secondary bg-secondary/10 text-xl font-bold text-secondary sm:h-20 sm:w-20 sm:text-2xl">
                {initialsOf(profile.name)}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-2xl uppercase tracking-wide text-foreground sm:text-4xl">{profile.name}</h1>
                <p className="mt-1 truncate text-sm text-muted-foreground sm:text-base">
                  @{profile.username}
                  {profile.college_name ? ` · ${profile.college_name}` : ""}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-3">
              <p>
                <span className="numeric text-4xl font-bold text-foreground">{Math.round(profile.rating)}</span> <span className="text-base text-muted-foreground">rating</span>
              </p>
              <p className="font-display text-xl uppercase tracking-wide text-secondary">{profile.league}</p>
            </div>
            <div
              className="mt-3 h-2.5 rounded-[2px] bg-border/60"
              role="progressbar"
              aria-valuenow={Math.round(pct * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={next ? `Progress to ${next.name}` : "Top league"}
            >
              <div className="h-full rounded-[2px] bg-secondary transition-[width] duration-500" style={{ width: `${Math.max(pct * 100, 2)}%` }} />
            </div>
            <p className="mt-2 text-base text-muted-foreground">
              {next ? `${toNext} to ${next.name}` : "Top league"} · best {Math.round(profile.best_rating)} · #{profile.rank} on the leaderboard
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => setChallenging(true)}>
              <Swords className="h-4 w-4" /> Challenge to duel
            </Button>
            <FriendAction profile={profile} />
          </div>
        </header>
      </Reveal>

      <Reveal delay={0.05} className="surface-panel p-4 sm:p-5">
        <h2 className="mb-3 font-display text-2xl uppercase tracking-wide text-foreground">Head to head</h2>
        <HeadToHeadPanel opponentId={profile.user_id} opponentName={profile.name} phase="before" />
      </Reveal>

      <StaggerGroup className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border lg:grid-cols-4">
        <Stat icon={Flame} label="Day streak" value={profile.current_streak} sub={`best ${profile.max_streak}`} />
        <Stat icon={Swords} label="Duels played" value={profile.matches_played} />
        <Stat icon={Target} label="Accuracy" value={Math.round(profile.accuracy)} suffix="%" sub={`${profile.total_correct} of ${totalAnswered} correct`} />
        <Stat icon={Trophy} label="Total XP" value={profile.total_xp} />
      </StaggerGroup>

      {challenging ? <ChallengeDialog opponent={opponent} onClose={() => setChallenging(false)} /> : null}
    </div>
  );
}

function FriendAction({ profile }: { profile: Pick<PublicProfile, "username" | "name" | "friend_status"> }) {
  const queryClient = useQueryClient();
  const sendRequest = useMutation(getSendFriendRequestMutationOptions());
  const [sent, setSent] = useState(false);

  async function onAdd() {
    try {
      await sendRequest.mutateAsync({ username: profile.username });
      setSent(true);
      toast({ title: "Friend request sent" });
      void queryClient.invalidateQueries({ queryKey: getGetPublicProfileQueryKey(profile.username) });
    } catch (err) {
      toast({ title: "Couldn't send request", description: getErrorMessage(err), variant: "destructive" });
    }
  }

  if (profile.friend_status === "friends") {
    return (
      <Button variant="outline" disabled>
        <UserCheck className="h-4 w-4" /> Friends
      </Button>
    );
  }
  if (sent || profile.friend_status === "pending_outgoing") {
    return (
      <Button variant="outline" disabled>
        <UserCheck className="h-4 w-4" /> Requested
      </Button>
    );
  }
  if (profile.friend_status === "pending_incoming") {
    return (
      <Button variant="outline" disabled>
        Respond in notifications
      </Button>
    );
  }
  return (
    <Button variant="outline" disabled={sendRequest.isPending} onClick={() => void onAdd()}>
      <UserPlus className="h-4 w-4" /> Add friend
    </Button>
  );
}
