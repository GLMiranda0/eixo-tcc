-- =====================================================================
-- Eixo · migração 002 · papéis, limites por empresa, isolamento, convites e auditoria
-- Aplicar após schema.sql. Idempotente onde possível.
--
-- Papéis:
--   dev    : global (conta_id null). Lê tudo, não edita dados das empresas.
--   master : 1 por empresa. Gerencia usuários (convites, papéis, desativação) e edita dados.
--   admin  : até 4 por empresa. Edita motores, coletores, regras, alertas.
--   comum  : até 5 por empresa. Só visualiza e acompanha o monitoramento.
-- Empresa = tabela contas. Uma empresa nunca enxerga dados de outra.
-- =====================================================================

-- ---------- 1. perfis e contas ----------
alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check check (papel in ('dev','master','admin','comum'));
alter table perfis add column if not exists ativo boolean not null default true;
alter table perfis add column if not exists email text;
alter table perfis add column if not exists criado_por uuid;
update perfis p set email = u.email from auth.users u where u.id = p.id and p.email is null;
update perfis set papel = 'master' where papel = 'admin';   -- quem criou a conta no schema anterior vira master

alter table contas add column if not exists cnpj text;
alter table contas add column if not exists criado_por uuid;
alter table contas add column if not exists ativa boolean not null default true;

-- ---------- 2. funções auxiliares (usadas nas policies) ----------
create or replace function conta_atual() returns uuid
language sql stable security definer set search_path = public as $$
  select conta_id from perfis where id = auth.uid() and ativo
$$;
create or replace function papel_atual() returns text
language sql stable security definer set search_path = public as $$
  select papel from perfis where id = auth.uid() and ativo
$$;
create or replace function is_dev() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'dev' from perfis where id = auth.uid() and ativo), false)
$$;
create or replace function is_master() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'master' from perfis where id = auth.uid() and ativo), false)
$$;
create or replace function pode_editar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel in ('master','admin') from perfis where id = auth.uid() and ativo), false)
$$;
-- motor pertence à empresa do usuário logado?
create or replace function motor_da_conta(p_motor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from motores m where m.id = p_motor and m.conta_id = conta_atual())
$$;

-- ---------- 3. convites (master convida admin/comum pelo e-mail) ----------
create table if not exists convites (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas(id) on delete cascade,
  email text not null,
  papel text not null check (papel in ('admin','comum')),
  criado_por uuid references perfis(id),
  criado_em timestamptz not null default now(),
  aceito_em timestamptz,
  aceito_por uuid
);
create unique index if not exists convites_email_pendente on convites (lower(email)) where aceito_em is null;

-- ---------- 4. limites por papel (1 master, 4 admin, 5 comum por empresa) ----------
create or replace function checar_limite_papel() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lim integer; v_n integer;
begin
  if new.papel = 'dev' then
    new.conta_id := null;
    return new;
  end if;
  if new.conta_id is null then
    raise exception 'Perfil % precisa estar ligado a uma empresa', new.papel using errcode = 'P0001';
  end if;
  if new.ativo then
    v_lim := case new.papel when 'master' then 1 when 'admin' then 4 when 'comum' then 5 end;
    select count(*) into v_n from perfis
      where conta_id = new.conta_id and papel = new.papel and ativo and id <> new.id;
    if v_n >= v_lim then
      raise exception 'Limite de % usuário(s) com papel % atingido nesta empresa', v_lim, new.papel using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_limite_papel on perfis;
create trigger trg_limite_papel before insert or update of papel, conta_id, ativo on perfis
  for each row execute function checar_limite_papel();

-- limite também na hora de convidar
create or replace function checar_limite_convite() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lim integer; v_n integer;
begin
  v_lim := case new.papel when 'admin' then 4 when 'comum' then 5 end;
  select (select count(*) from perfis where conta_id = new.conta_id and papel = new.papel and ativo)
       + (select count(*) from convites where conta_id = new.conta_id and papel = new.papel and aceito_em is null)
    into v_n;
  if v_n >= v_lim then
    raise exception 'Limite de % usuário(s) com papel % (contando convites pendentes) atingido', v_lim, new.papel using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_limite_convite on convites;
create trigger trg_limite_convite before insert on convites
  for each row execute function checar_limite_convite();

-- ---------- 5. novo usuário: convite pendente → entra na empresa; senão cria empresa e vira master ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_conv convites%rowtype;
  v_conta uuid;
  v_nome text := nullif(new.raw_user_meta_data->>'nome', '');
  v_empresa text := nullif(new.raw_user_meta_data->>'empresa', '');
begin
  select * into v_conv from convites where lower(email) = lower(new.email) and aceito_em is null;
  if found then
    insert into perfis (id, conta_id, nome, papel, email, criado_por)
    values (new.id, v_conv.conta_id, v_nome, v_conv.papel, new.email, v_conv.criado_por);
    update convites set aceito_em = now(), aceito_por = new.id where id = v_conv.id;
  else
    insert into contas (nome, criado_por)
    values (coalesce(v_empresa, split_part(new.email, '@', 1) || ' · empresa'), new.id)
    returning id into v_conta;
    insert into perfis (id, conta_id, nome, papel, email, criado_por)
    values (new.id, v_conta, v_nome, 'master', new.email, new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- 6. auditoria de operações ----------
create table if not exists auditoria (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  usuario_id uuid,
  usuario_email text,
  conta_id uuid,
  tabela text not null,
  operacao text not null,               -- INSERT | UPDATE | DELETE
  registro_id text,
  antes jsonb,
  depois jsonb
);
create index if not exists auditoria_conta_ts on auditoria (conta_id, ts desc);

create or replace function registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_conta uuid; v_antes jsonb; v_depois jsonb; v_email text; v_motor uuid;
begin
  v_antes  := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) - 'token_hash' end;
  v_depois := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) - 'token_hash' end;
  if tg_op = 'UPDATE' and v_antes = v_depois then return new; end if;   -- nada mudou

  if tg_table_name = 'contas' then
    v_conta := coalesce((v_depois->>'id')::uuid, (v_antes->>'id')::uuid);
  else
    v_conta := coalesce((v_depois->>'conta_id')::uuid, (v_antes->>'conta_id')::uuid);
  end if;
  if v_conta is null then
    v_motor := coalesce((v_depois->>'motor_id')::uuid, (v_antes->>'motor_id')::uuid);
    if v_motor is not null then select conta_id into v_conta from motores where id = v_motor; end if;
  end if;

  select email into v_email from perfis where id = auth.uid();
  insert into auditoria (usuario_id, usuario_email, conta_id, tabela, operacao, registro_id, antes, depois)
  values (auth.uid(), coalesce(v_email, case when auth.uid() is null then 'sistema' end), v_conta, tg_table_name, tg_op,
          coalesce(v_depois->>'id', v_antes->>'id'), v_antes, v_depois);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['contas','perfis','motores','coletores','regras_diagnostico','alertas','convites'] loop
    execute format('drop trigger if exists trg_auditoria on %I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on %I for each row execute function registrar_auditoria()', t);
  end loop;
end $$;

-- ---------- 7. RLS: isolamento por empresa + papéis ----------
alter table convites enable row level security;
alter table auditoria enable row level security;

-- remove policies antigas
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- contas (empresas)
create policy "contas: ler" on contas for select using (id = conta_atual() or is_dev());
create policy "contas: master edita" on contas for update using (id = conta_atual() and is_master()) with check (id = conta_atual());

-- perfis
create policy "perfis: ler" on perfis for select using (id = auth.uid() or conta_id = conta_atual() or is_dev());
create policy "perfis: editar" on perfis for update
  using (id = auth.uid() or (conta_id = conta_atual() and is_master()))
  with check (
    is_dev()
    or (papel <> 'dev' and conta_id = conta_atual()
        and (is_master() or papel = papel_atual()))
  );

-- convites
create policy "convites: ler" on convites for select using (conta_id = conta_atual() or is_dev());
create policy "convites: master cria" on convites for insert with check (conta_id = conta_atual() and is_master());
create policy "convites: master apaga" on convites for delete using (conta_id = conta_atual() and is_master());

-- motores
create policy "motores: ler" on motores for select using (conta_id = conta_atual() or is_dev());
create policy "motores: editar" on motores for insert with check (conta_id = conta_atual() and pode_editar());
create policy "motores: atualizar" on motores for update using (conta_id = conta_atual() and pode_editar()) with check (conta_id = conta_atual());
create policy "motores: apagar" on motores for delete using (conta_id = conta_atual() and pode_editar());

-- coletores / regras (via motor)
create policy "coletores: ler" on coletores for select using (motor_da_conta(motor_id) or is_dev());
create policy "coletores: editar" on coletores for all using (motor_da_conta(motor_id) and pode_editar()) with check (motor_da_conta(motor_id) and pode_editar());
create policy "regras: ler" on regras_diagnostico for select using (motor_da_conta(motor_id) or is_dev());
create policy "regras: editar" on regras_diagnostico for all using (motor_da_conta(motor_id) and pode_editar()) with check (motor_da_conta(motor_id) and pode_editar());

-- leituras / baseline / anomalias: só leitura (escrita vem das funções security definer)
create policy "leituras: ler" on leituras for select using (motor_da_conta(motor_id) or is_dev());
create policy "baseline: ler" on baseline_motor for select using (motor_da_conta(motor_id) or is_dev());
create policy "anomalias: ler" on anomalias for select using (motor_da_conta(motor_id) or is_dev());

-- alertas: comum só lê; admin/master reconhecem
create policy "alertas: ler" on alertas for select using (motor_da_conta(motor_id) or is_dev());
create policy "alertas: tratar" on alertas for update using (motor_da_conta(motor_id) and pode_editar()) with check (motor_da_conta(motor_id));

-- ações corretivas: catálogo público para logados
create policy "acoes: ler" on acoes_corretivas for select to authenticated using (true);

-- auditoria: master/admin da empresa e dev
create policy "auditoria: ler" on auditoria for select using ((conta_id = conta_atual() and pode_editar()) or is_dev());

-- ---------- 8. views com RLS do usuário (security_invoker) ----------
alter view status_aprendizado set (security_invoker = true);

create or replace view visao_dev with (security_invoker = true) as
select c.id as conta_id, c.nome, c.cnpj, c.ativa, c.criado_em,
       (select count(*) from perfis p where p.conta_id = c.id and p.ativo)                              as usuarios,
       (select count(*) from perfis p where p.conta_id = c.id and p.ativo and p.papel = 'master')       as masters,
       (select count(*) from perfis p where p.conta_id = c.id and p.ativo and p.papel = 'admin')        as admins,
       (select count(*) from perfis p where p.conta_id = c.id and p.ativo and p.papel = 'comum')        as comuns,
       (select count(*) from motores m where m.conta_id = c.id)                                         as motores,
       (select count(*) from coletores co join motores m on m.id = co.motor_id where m.conta_id = c.id) as coletores,
       (select count(*) from alertas a join motores m on m.id = a.motor_id where m.conta_id = c.id and a.status = 'ativo') as alertas_ativos,
       (select max(co.ultimo_contato) from coletores co join motores m on m.id = co.motor_id where m.conta_id = c.id) as ultimo_contato
from contas c;

-- ---------- 9. grants ----------
grant select on visao_dev to authenticated;
grant select, insert, delete on convites to authenticated;
grant select on auditoria to authenticated;
grant execute on function papel_atual(), is_dev(), is_master(), pode_editar(), motor_da_conta(uuid) to authenticated;
