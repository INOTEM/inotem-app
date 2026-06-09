-- ============================================================
-- INOTEM APP — Supabase セットアップ
-- Supabase ダッシュボード → SQL Editor に貼り付けて実行してください。
-- 何度実行しても安全（IF NOT EXISTS / DROP POLICY IF EXISTS）です。
-- ============================================================

-- ------------------------------------------------------------
-- 1. バグ修正：daily_reports に書き込みポリシーが無く upsert が
--    RLS(42501) で拒否されていた。本人の行を INSERT/UPDATE できるようにする。
-- ------------------------------------------------------------
alter table public.daily_reports enable row level security;

drop policy if exists "daily_reports own insert" on public.daily_reports;
create policy "daily_reports own insert"
  on public.daily_reports for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "daily_reports own update" on public.daily_reports;
create policy "daily_reports own update"
  on public.daily_reports for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 2. 新機能：週次振り返り（週報）テーブル
-- ------------------------------------------------------------
create table if not exists public.weekly_reflections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  week_start     date not null,                 -- 当該週の月曜日
  went_well      text,                           -- 今週うまくいったこと
  reflection     text,                           -- 反省点
  next_week_goal text,                           -- 来週の目標
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_reflections enable row level security;

drop policy if exists "weekly_reflections own select" on public.weekly_reflections;
create policy "weekly_reflections own select"
  on public.weekly_reflections for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "weekly_reflections own insert" on public.weekly_reflections;
create policy "weekly_reflections own insert"
  on public.weekly_reflections for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "weekly_reflections own update" on public.weekly_reflections;
create policy "weekly_reflections own update"
  on public.weekly_reflections for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
