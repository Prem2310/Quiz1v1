import { useState } from "react";
import { Redirect } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Swords, UserCheck, UserPlus } from "lucide-react";
import { getGetPublicProfileQueryKey, getSendFriendRequestMutationOptions, useGetPublicProfile, type PublicProfile, type User, type UserSummary } from "@workspace/api-client-react";
import { ChallengeDialog } from "@/components/quiz/ChallengeDialog";
import { HeadToHeadPanel } from "@/components/quiz/HeadToHeadPanel";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateBlocks";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { HudStat, LeagueMeter, Portrait, SectionTitle } from "@/components/profile/ProfileParts";
import { Button } from "@/components/ui/button";
import { getErrorMessage, isNotFoundError } from "@/lib/errors";
import { cn } from "@/lib/utils";
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

  return <ProfileContent profile={query.data} me={me} />;
}

function ProfileContent({ profile, me }: { profile: PublicProfile; me: User | null }) {
  const [challenging, setChallenging] = useState(false);
  const totalAnswered = profile.total_correct + profile.total_incorrect;
  const meAnswered = me ? me.total_correct + me.total_incorrect : 0;
  const opponent: UserSummary = {
    user_id: profile.user_id,
    username: profile.username,
    name: profile.name,
    college_name: profile.college_name,
    rating: profile.rating,
    league: profile.league,
    friend_status: profile.friend_status,
  };

  const tape: TapeRow[] = [
    { label: "Rating", mine: me ? Math.round(me.user_rating) : null, theirs: Math.round(profile.rating) },
    { label: "Accuracy", mine: me && meAnswered ? Math.round((me.total_correct / meAnswered) * 100) : me ? 0 : null, theirs: Math.round(profile.accuracy), suffix: "%" },
    { label: "Duels played", mine: me?.matches_played ?? null, theirs: profile.matches_played },
    { label: "Day streak", mine: me?.current_streak ?? null, theirs: profile.current_streak },
    { label: "Best streak", mine: me?.max_streak ?? null, theirs: profile.max_streak },
    { label: "Total XP", mine: me?.total_xp ?? null, theirs: profile.total_xp, grouped: true },
  ];

  return (
    <div className="space-y-6">
      <Reveal>
        <header className="glass-panel overflow-hidden">
          {/* Two corners, never blended: you on the left, them on the right — a versus screen, not a bio page. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 p-5 sm:gap-6 sm:p-6">
            <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Portrait name={me?.name ?? "You"} corner="p1" size="md" />
              <div className="w-full min-w-0 sm:w-auto">
                <p className="truncate font-display text-lg uppercase leading-none tracking-wide text-foreground sm:text-2xl">You</p>
                {me ? (
                  <p className="numeric mt-1.5 text-sm font-bold text-primary">
                    {Math.round(me.user_rating)} <span className="label-micro text-muted-foreground">{me.league}</span>
                  </p>
                ) : null}
              </div>
            </div>

            <span className="font-display text-2xl leading-none text-muted-foreground/70 sm:text-4xl" aria-hidden>
              VS
            </span>

            <div className="flex min-w-0 flex-col items-end gap-3 text-right sm:flex-row-reverse sm:items-center sm:gap-4">
              <Portrait name={profile.name} corner="p2" size="md" />
              <div className="w-full min-w-0 sm:w-auto">
                <h1 className="line-clamp-2 break-words font-display text-lg uppercase leading-[1.05] tracking-wide text-foreground sm:text-2xl">{profile.name}</h1>
                <p className="numeric mt-1.5 text-sm font-bold text-secondary">
                  <span className="label-micro text-muted-foreground">{profile.league}</span> {Math.round(profile.rating)}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-border bg-surface-2/60 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 truncate text-sm text-muted-foreground">
                @{profile.username}
                {profile.college_name ? ` · ${profile.college_name}` : ""}
                <span className="hidden sm:inline"> · joined {format(new Date(profile.joined_at), "MMM yyyy")}</span>
              </p>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button onClick={() => setChallenging(true)}>
                  <Swords className="h-4 w-4" /> Challenge to duel
                </Button>
                <FriendAction profile={profile} />
              </div>
            </div>
          </div>
        </header>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start">
        <div className="space-y-6">
          <Reveal delay={0.05} className="surface-panel overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
              <HudStat label="Rank">#{profile.rank}</HudStat>
              <HudStat label="Best">{Math.round(profile.best_rating)}</HudStat>
              <HudStat label="Answered">{totalAnswered.toLocaleString()}</HudStat>
            </div>
            <div className="px-4 py-3.5 sm:px-5">
              <LeagueMeter rating={profile.rating} corner="p2" />
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <HeadToHeadPanel opponentId={profile.user_id} opponentName={profile.name} phase="before" linked />
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <SectionTitle
            aside={
              <span className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-primary">
                  <span className="h-2 w-2 bg-primary" /> You
                </span>
                <span className="flex items-center gap-1.5 text-secondary">
                  Them <span className="h-2 w-2 bg-secondary" />
                </span>
              </span>
            }
          >
            Tale of the tape
          </SectionTitle>
          <StaggerGroup className="surface-panel divide-y divide-border">
            {tape.map((row) => (
              <TapeLine key={row.label} row={row} />
            ))}
          </StaggerGroup>
        </Reveal>
      </div>

      {challenging ? <ChallengeDialog opponent={opponent} onClose={() => setChallenging(false)} /> : null}
    </div>
  );
}

interface TapeRow {
  label: string;
  mine: number | null;
  theirs: number;
  suffix?: string;
  /** Thousands separators — for totals, not ratings. */
  grouped?: boolean;
}

/** One stat, face to face: your bar grows left from the centre line, theirs grows right. The longer bar leads. */
function TapeLine({ row }: { row: TapeRow }) {
  const mine = row.mine ?? 0;
  const top = Math.max(mine, row.theirs, 1);
  const lead = row.mine == null || mine === row.theirs ? null : mine > row.theirs ? "p1" : "p2";
  const fmt = (v: number) => `${row.grouped ? v.toLocaleString() : v}${row.suffix ?? ""}`;
  return (
    <StaggerItem className="px-4 py-3 sm:px-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-3">
        <span className={cn("numeric truncate text-sm font-bold", lead === "p1" ? "text-primary" : "text-muted-foreground")}>{row.mine == null ? "–" : fmt(mine)}</span>
        <span className="label-micro text-center">{row.label}</span>
        <span className={cn("numeric truncate text-right text-sm font-bold", lead === "p2" ? "text-secondary" : "text-muted-foreground")}>{fmt(row.theirs)}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1" aria-hidden>
        <div className="flex h-1.5 justify-end bg-border/50">
          <div className={cn("h-full transition-[width] duration-700 ease-out", lead === "p1" ? "bg-primary" : "bg-primary/40")} style={{ width: `${(mine / top) * 100}%` }} />
        </div>
        <div className="h-1.5 bg-border/50">
          <div className={cn("h-full transition-[width] duration-700 ease-out", lead === "p2" ? "bg-secondary" : "bg-secondary/40")} style={{ width: `${(row.theirs / top) * 100}%` }} />
        </div>
      </div>
    </StaggerItem>
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
