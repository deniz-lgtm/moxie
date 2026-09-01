-- Custom auth: replaces Supabase Auth with app-managed users + TOTP 2FA.
-- Sessions are opaque random tokens stored server-side; the client holds
-- only an HTTP-only cookie pointing at the session row.

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  role text,
  password_hash text not null,
  totp_secret text,           -- base32 secret; null until enrolled
  totp_enrolled_at timestamptz,
  is_active boolean not null default true,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_users_email_idx on app_users (lower(email));

create table if not exists user_sessions (
  token text primary key,           -- random 32-byte hex
  user_id uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  user_agent text,
  ip text
);

create index if not exists user_sessions_user_idx on user_sessions (user_id);
create index if not exists user_sessions_expires_idx on user_sessions (expires_at);

-- Pending 2FA challenges: created after password verify, consumed by /verify-2fa.
create table if not exists user_2fa_challenges (
  id text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists user_2fa_challenges_expires_idx on user_2fa_challenges (expires_at);
