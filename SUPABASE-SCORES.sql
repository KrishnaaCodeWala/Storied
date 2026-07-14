-- STORIED — open leaderboard table (Option A, no accounts)
-- Run this in Supabase → SQL Editor → New query → Run.
-- Safe to run once; it creates the table the leaderboard needs.

create table scores (
  id bigint generated always as identity primary key,
  handle text not null check (char_length(handle) between 1 and 24),
  score int not null check (score between 0 and 5000),
  mode text not null default 'classic' check (char_length(mode) <= 16),
  pack text default '' check (char_length(pack) <= 40),
  created_at timestamptz not null default now()
);

-- Anyone may read the board and post a score (no accounts).
-- The CHECK constraints above are the guardrails: names are length-
-- bounded and scores can't exceed the game's real maximum, so a
-- bad actor can't post a name-bomb or a 999999 score.
alter table scores enable row level security;

create policy "read the board" on scores
  for select using (true);

create policy "post a score" on scores
  for insert with check (true);

-- Speed: the board query orders by score desc.
create index scores_score_idx on scores (score desc, created_at asc);
