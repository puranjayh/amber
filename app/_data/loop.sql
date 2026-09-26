-- Live loop store. Run once in the Supabase SQL editor.
-- API routes use the service role; the browser never talks to Postgres.

create table if not exists preferences (
  patient_id text primary key,
  max_travel_minutes integer not null,
  max_visits_per_month integer not null,
  accepts_placebo boolean not null,
  driver text not null,
  updated_at timestamptz not null default now()
);

create table if not exists nudges (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('fill_preferences', 'enrol_patient', 'trial_suggestion')),
  from_role text not null check (from_role in ('coordinator', 'patient', 'physician')),
  to_role text not null check (to_role in ('coordinator', 'patient', 'physician')),
  patient_id text not null,
  nct_id text,
  status text not null check (status in ('pending', 'seen', 'done')),
  created_at timestamptz not null default now()
);

alter table nudges add column if not exists batch_id text;

create index if not exists nudges_patient_idx on nudges (patient_id);
create index if not exists nudges_status_idx on nudges (status);
create index if not exists nudges_batch_idx on nudges (batch_id);

create table if not exists physician_notes (
  physician_id text primary key,
  text text not null,
  updated_at timestamptz not null default now()
);
