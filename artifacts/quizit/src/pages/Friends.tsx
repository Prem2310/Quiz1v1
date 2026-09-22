import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Swords, UserMinus, UserPlus } from "lucide-react";
import {
  getListFriendsQueryKey,
  getSearchUsersQueryKey,
  getSendFriendRequestMutationOptions,
  useListFriends,
  useRemoveFriend,
  useSearchUsers,
  type UserSummary,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, EmptyState, LoadingState } from "@/components/common/StateBlocks";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChallengeDialog } from "@/components/quiz/ChallengeDialog";
import { initialsOf } from "@/components/layout/AppShell";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export default function Friends() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 350);
  const friendsQuery = useListFriends();
  const searchQuery = useSearchUsers(
    { q: debouncedQuery },
    { query: { queryKey: getSearchUsersQueryKey({ q: debouncedQuery }), enabled: debouncedQuery.trim().length > 0 } },
  );
  const [challengeTarget, setChallengeTarget] = useState<UserSummary | null>(null);

  return (
    <div className="space-y-8">
      <PageHeader title="Friends" description="Add classmates, then challenge them to a custom duel." />

      <Reveal>
        <p className="label-micro mb-2">Find friends</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Search players by username" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username" className="pl-9" />
        </div>
        {debouncedQuery.trim() ? (
          <div className="surface-panel mt-3 divide-y divide-border">
            {searchQuery.isError ? (
              <ErrorState message="Couldn't search right now." onRetry={() => void searchQuery.refetch()} />
            ) : searchQuery.isPending ? (
              <LoadingState label="Searching…" />
            ) : !searchQuery.data?.length ? (
              <p className="p-4 text-center text-sm text-muted-foreground">No one found with that username.</p>
            ) : (
              searchQuery.data.map((person) => <SearchResultRow key={person.user_id} person={person} />)
            )}
          </div>
        ) : null}
      </Reveal>

      <Reveal delay={0.08}>
        <p className="label-micro mb-2">My friends ({friendsQuery.data?.length ?? 0})</p>
        {friendsQuery.isError ? (
          <ErrorState message="Couldn't load your friends." onRetry={() => void friendsQuery.refetch()} />
        ) : friendsQuery.isPending ? (
          <LoadingState label="Loading friends…" />
        ) : !friendsQuery.data?.length ? (
          <EmptyState title="No friends yet" message="Search for a classmate above and send them a friend request." />
        ) : (
          <StaggerGroup className="surface-panel divide-y divide-border">
            {friendsQuery.data.map((friend) => (
              <StaggerItem key={friend.user_id}>
                <FriendRow friend={friend} onChallenge={() => setChallengeTarget(friend)} />
              </StaggerItem>
            ))}
          </StaggerGroup>
        )}
      </Reveal>

      {challengeTarget ? <ChallengeDialog opponent={challengeTarget} onClose={() => setChallengeTarget(null)} /> : null}
    </div>
  );
}

function SearchResultRow({ person }: { person: UserSummary }) {
  const queryClient = useQueryClient();
  const sendRequest = useMutation(getSendFriendRequestMutationOptions());
  const [sent, setSent] = useState(person.friend_status === "pending_outgoing");

  async function onAdd() {
    try {
      await sendRequest.mutateAsync({ username: person.username });
      setSent(true);
      toast({ title: "Friend request sent" });
      void queryClient.invalidateQueries({ queryKey: getSearchUsersQueryKey() });
    } catch (err) {
      toast({ title: "Couldn't send request", description: getErrorMessage(err), variant: "destructive" });
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-[calc(var(--radius)-2px)] border border-transparent p-3 transition-colors hover:border-primary">
      <Link href={`/profile/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initialsOf(person.name)}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{person.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            @{person.username} · {Math.round(person.rating)} · {person.league}
          </p>
        </div>
      </Link>
      {person.friend_status === "friends" ? (
        <span className="label-micro shrink-0">Friends</span>
      ) : sent || person.friend_status === "pending_outgoing" ? (
        <span className="label-micro shrink-0">Requested</span>
      ) : person.friend_status === "pending_incoming" ? (
        <span className="label-micro shrink-0">Respond in notifications</span>
      ) : (
        <Button size="sm" variant="outline" disabled={sendRequest.isPending} onClick={() => void onAdd()}>
          <UserPlus className="h-3.5 w-3.5" /> Add
        </Button>
      )}
    </div>
  );
}

function FriendRow({ friend, onChallenge }: { friend: UserSummary; onChallenge: () => void }) {
  const queryClient = useQueryClient();
  const removeFriend = useRemoveFriend();

  async function onRemove() {
    try {
      await removeFriend.mutateAsync({ friendUserId: friend.user_id });
      void queryClient.invalidateQueries({ queryKey: getListFriendsQueryKey() });
    } catch (err) {
      toast({ title: "Couldn't remove friend", description: getErrorMessage(err), variant: "destructive" });
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-[calc(var(--radius)-2px)] border border-transparent p-3 transition-colors hover:border-primary">
      <Link href={`/profile/${friend.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initialsOf(friend.name)}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{friend.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            @{friend.username} · {Math.round(friend.rating)} · {friend.league}
          </p>
        </div>
      </Link>
      <Button size="sm" onClick={onChallenge}>
        <Swords className="h-3.5 w-3.5" /> Challenge
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Remove friend" disabled={removeFriend.isPending} onClick={() => void onRemove()}>
        <UserMinus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
