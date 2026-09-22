import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Swords, X } from "lucide-react";
import {
  getCancelChallengeMutationOptions,
  getCreateChallengeMutationOptions,
  getGetChallengeQueryKey,
  useGetChallenge,
  useListTopics,
  type UserSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { initialsOf } from "@/components/layout/AppShell";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

const QUESTION_OPTIONS = [5, 10, 15];
const TIME_OPTIONS = [10, 15, 20, 30];

/** Send a custom duel challenge to `opponent` and wait for them to respond. Used from Friends and public profiles. */
export function ChallengeDialog({ opponent, onClose }: { opponent: UserSummary; onClose: () => void }) {
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
