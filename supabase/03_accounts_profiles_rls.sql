-- Accounts module prerequisite: lock down profiles and allow coaching staff to view all.
-- This prevents athletes from seeing other users' email/phone (RLS cannot restrict columns).

alter table public.profiles enable row level security;

-- Drop existing policies if they exist (safe to run repeatedly)
do $$
declare
  p record;
begin
  for p in (
    select polname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and polname in (
        'profiles_select_own_or_coach',
        'profiles_update_own_or_coach'
      )
  ) loop
    execute format('drop policy %I on public.profiles', p.polname);
  end loop;
end $$;

-- Coaches & assistant coaches can read all profiles.
-- Everyone can read their own profile.
create policy profiles_select_own_or_coach
on public.profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('coach', 'assistant_coach')
  )
);

-- Allow users to update their own profile; coaching staff can update any.
create policy profiles_update_own_or_coach
on public.profiles
for update
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('coach', 'assistant_coach')
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('coach', 'assistant_coach')
  )
);
