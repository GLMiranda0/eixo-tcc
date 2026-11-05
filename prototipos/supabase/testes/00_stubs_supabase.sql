-- Stubs mínimos do Supabase para testar as migrações num PostgreSQL comum (15+).
-- Roles anon/authenticated, auth.users, auth.uid(), extensions.digest() e a publicação do Realtime.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$; do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema extensions;
create function extensions.digest(text, text) returns bytea language sql immutable as $$ select sha256(convert_to($1, 'UTF8')) $$;
create publication supabase_realtime;
