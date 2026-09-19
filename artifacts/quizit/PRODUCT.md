# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students preparing for campus placements and competitive exams (banking, SSC, and similar) who practice aptitude and reasoning problems. They study in short, repeated sessions, often competitively against peers, and care about measurable improvement over time.

## Product Purpose

quiz1v1 is a competitive quiz-practice platform for placement/exam prep. It lets users drill topic-based question sets solo (Practice) and head-to-head in real time (Duels/Arena), tracks progress, and ranks users on a leaderboard. Success is a user returning regularly, improving accuracy/speed on weak topics, and engaging in duels with friends.

## Positioning

Combines exam-style question banks (seeded from IndiaBix content) with real-time competitive dueling and social/leaderboard mechanics — practice that feels like a game against real people, not a static question bank.

## Operating Context

- Core surfaces: Landing, Login/Signup, Arena (home/hub), Practice, Duel Matchmaking, Duel Room (live 1v1), Leaderboard, Friends, Profile, Progress, Settings.
- Topics are seeded from IndiaBix and cover six areas: aptitude, data interpretation, verbal ability, logical reasoning, verbal reasoning, non-verbal reasoning.
- Duels are real-time (matchmaking into a live room), implying latency-sensitive, session-based UI states (waiting, live, results).
- Auth-gated app shell wraps all authenticated routes; unauthenticated users land on a marketing/landing page.

## Capabilities and Constraints

- Stack: React + Vite, TypeScript, Tailwind, shadcn/ui (Radix primitives), wouter for routing, TanStack Query, framer-motion available for motion.
- Backend via `@workspace/api-client-react`, token-based auth (access_token in localStorage).
- Redesign scope is visual + light UX restructuring: current pages/routes/functionality are preserved as the product surface, but information architecture and flows may be adjusted where it clearly improves the experience. This is not a ground-up rebuild of functionality.

## Brand Commitments

- Product name "quiz1v1" is fixed (renamed from QuizIt; the name is the idea: two players, one question, 1v1). Always lowercase in running text.
- Logo, color palette, typography, and overall visual identity are fully open for reinvention (no existing brand anchor to preserve).

## Evidence on Hand

No testimonials, case studies, press, or user research on hand. Do not fabricate any.

## Product Principles

1. Practice should feel fast and low-friction — students return for short, repeated sessions.
2. Competition (duels, leaderboard) is a core engagement mechanic, not a bolt-on feature.
3. Clarity under time pressure — quiz/duel UI must stay legible and fast during timed, live interactions.
4. Progress must feel visible and motivating across sessions.
