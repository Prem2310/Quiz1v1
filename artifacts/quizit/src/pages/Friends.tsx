import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Swords, UserMinus, UserPlus, X } from "lucide-react";
import {
  getCancelChallengeMutationOptions,
  getCreateChallengeMutationOptions,
  getGetChallengeQueryKey,
  getListFriendsQueryKey,
  getSearchUsersQueryKey,
  getSendFriendRequestMutationOptions,
  useGetChallenge,
  useListFriends,
  useListTopics,
  useRemoveFriend,
  useSearchUsers,
  type UserSummary,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, EmptyState, LoadingState } from "@/components/common/StateBlocks";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
    <div className="flex items-center gap-3 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initialsOf(person.name)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{person.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{person.username} · {Math.round(person.rating)} · {person.league}
        </p>
      </div>
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
    <div className="flex items-center gap-3 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initialsOf(friend.name)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{friend.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{friend.username} · {Math.round(friend.rating)} · {friend.league}
        </p>
      </div>
      <Button size="sm" onClick={onChallenge}>
        <Swords className="h-3.5 w-3.5" /> Challenge
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Remove friend" disabled={removeFriend.isPending} onClick={() => void onRemove()}>
        <UserMinus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

const QUESTION_OPTIONS = [5, 10, 15];
const TIME_OPTIONS = [10, 15, 20, 30];

function ChallengeDialog({ opponent, onClose }: { opponent: UserSummary; onClose: () => void }) {
  const [, navigate] = useLocation();
  const topicsQuery = useListTopics();
  const [topicId, setTopicId] = useState<number | null>(null);
  const [numQuestions, setNumQuestions] = useState(10);
  const [timePerQuestion, setTimePerQuestion] = useState(15);
  const [challengeId, setChallengeId] = useState<number | null>(null);
  const createChallenge = useMutation(getCreateChallengeMutationOptions());
  const cancelChallenge = useMutation(getCancelChallengeMutationOptions());

  const statusQuery = useGetChallenge(challengeId ?? 0, {
    query: { queryKey: getGetChallengeQueryKey(challengeId ?? 0), enabled: challengeId != null, refetchInterval: 2000 },
  });

  useEffect(() => {
    const status = statusQuery.data?.status;
    if (status === "accepted" && statusQuery.data?.duel_match_id) {
      navigate(`/duel/${statusQuery.data.duel_match_id}`);
    } else if (status === "declined" || status === "expired" || status === "cancelled") {
      toast({ title: "Challenge not accepted", description: `${opponent.name} didn't accept.` });
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusQuery.data]);

  async function send() {
    try {
      const challenge = await createChallenge.mutateAsync({ data: { opponent_id: opponent.user_id, topic_id: topicId, num_questions: numQuestions, time_per_question: timePerQuestion } });
      setChallengeId(challenge.id);
    } catch (err) {
      toast({ title: "Couldn't send challenge", description: getErrorMessage(err), variant: "destructive" });
    }
  }

  async function cancel() {
    if (challengeId != null) {
      try {
        await cancelChallenge.mutateAsync({ challengeId });
      } catch {
        // it'll expire on its own
      }
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && cancel()}>
      <DialogContent className="border-border bg-popover">
        {challengeId ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="pulse-ring flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <span className="text-lg font-bold text-primary">{initialsOf(opponent.name)}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Waiting for {opponent.name} to respond…</p>
              <p className="mt-1 text-xs text-muted-foreground">They'll get a notification to accept or decline.</p>
            </div>
            <Button variant="outline" onClick={() => void cancel()}>
              <X className="h-4 w-4" /> Cancel request
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Challenge {opponent.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <p className="label-micro mb-2">Topic (optional)</p>
                <div className="flex flex-wrap gap-1.5">
                  <PickChip active={topicId === null} onClick={() => setTopicId(null)}>
                    Any topic
                  </PickChip>
                  {topicsQuery.data?.map((topic) => (
                    <PickChip key={topic.id} active={topicId === topic.id} onClick={() => setTopicId(topic.id)}>
                      {topic.name}
                    </PickChip>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="label-micro mb-2">Questions</p>
                  <div className="flex gap-1.5">
                    {QUESTION_OPTIONS.map((n) => (
                      <PickChip key={n} active={numQuestions === n} onClick={() => setNumQuestions(n)}>
                        {n}
                      </PickChip>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="label-micro mb-2">Seconds / question</p>
                  <div className="flex gap-1.5">
                    {TIME_OPTIONS.map((n) => (
                      <PickChip key={n} active={timePerQuestion === n} onClick={() => setTimePerQuestion(n)}>
                        {n}
                      </PickChip>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={createChallenge.isPending} onClick={() => void send()}>
                <Swords className="h-4 w-4" /> Send challenge
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
