-- =====================================================================
-- Eixo · schema inicial (Supabase / Postgres)
-- Projeto: qcyortrufewhxdyzukyc (sa-east-1) · aplicado em 04/11/2026
-- Espelha o diagrama de classes do TCC: Operador, Motor, GatewayESP32,
-- LeituraSensor, RegraDiagnostico, Anomalia, Alerta, AcaoCorretiva,
-- mais a linha de base aprendida (fase 2 do diagnóstico).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- contas e perfis ----------
create table if not exists contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  conta_id uuid references contas(id) on delete set null,
  nome text,
  papel text not null default 'operador' check (papel in ('admin','operador')),
  criado_em timestamptz not null default now()
);

-- conta do usuário autenticado (usada nas policies)
create or replace function conta_atual() returns uuid
language sql stable security definer set search_path = public as $$
  select conta_id from perfis where id = auth.uid()
$$;

-- ao criar usuário no Auth: cria uma conta própria e o perfil admin
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_conta uuid;
begin
  insert into contas (nome) values (coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)) || ' · conta')
  returning id into v_conta;
  insert into perfis (id, conta_id, nome, papel)
  values (new.id, v_conta, new.raw_user_meta_data->>'nome', 'admin');
  return new;
end $$;
drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- motores ----------
create table if not exists motores (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas(id) on delete cascade,
  tag text not null,                      -- ex.: M-01
  nome text not null,                     -- ex.: Bomba centrífuga · bancada
  fabricante text,
  modelo text,
  potencia_cv numeric,
  tensao_nominal_v numeric,
  corrente_nominal_a numeric,
  rpm_nominal integer,
  aplicacao text not null default 'fixa' check (aplicacao in ('fixa','multispeed')),
  simulado boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (conta_id, tag)
);

-- ---------- coletores (gateway ESP32 ou de terceiro) ----------
create table if not exists coletores (
  id uuid primary key default gen_random_uuid(),
  motor_id uuid not null unique references motores(id) on delete cascade,
  tipo text not null default 'eixo' check (tipo in ('eixo','terceiro')),
  protocolo text not null default 'post' check (protocolo in ('post','mqtt')),
  token_hash text not null unique,        -- sha256 do token do dispositivo
  mede_temp boolean not null default true,
  mede_corr boolean not null default true,
  mede_vib  boolean not null default true,
  mede_tens boolean not null default false,
  mede_rot  boolean not null default false,
  ultimo_contato timestamptz,
  criado_em timestamptz not null default now()
);

-- ---------- leituras (1 Hz por motor) ----------
create table if not exists leituras (
  id bigint generated always as identity primary key,
  motor_id uuid not null references motores(id) on delete cascade,
  ts timestamptz not null default now(),
  temp numeric,      -- °C
  corr numeric,      -- A
  vib  numeric,      -- mm/s RMS
  tens numeric,      -- V (opcional)
  rot  numeric,      -- rpm (opcional)
  simulado boolean not null default false,
  valida boolean not null default true    -- false = descartada na validação física
);
create index if not exists leituras_motor_ts on leituras (motor_id, ts desc);

-- ---------- fase 1: limites fixos ----------
create table if not exists regras_diagnostico (
  id uuid primary key default gen_random_uuid(),
  motor_id uuid not null references motores(id) on delete cascade,
  grandeza text not null check (grandeza in ('temp','corr','vib','tens','rot')),
  limite_atencao numeric not null,
  limite_critico numeric not null,
  origem text not null default 'padrao' check (origem in ('padrao','usuario')),
  unique (motor_id, grandeza)
);

-- regras padrão ao cadastrar o motor (ISO 10816-3 classe I/II, % de In, classe F)
create or replace function criar_regras_padrao() returns trigger
language plpgsql as $$
begin
  insert into regras_diagnostico (motor_id, grandeza, limite_atencao, limite_critico) values
    (new.id, 'vib', 2.8, 4.5),
    (new.id, 'temp', 70, 85),
    (new.id, 'corr', coalesce(new.corrente_nominal_a,10) * 1.05, coalesce(new.corrente_nominal_a,10) * 1.15),
    (new.id, 'tens', coalesce(new.tensao_nominal_v,220) * 1.05, coalesce(new.tensao_nominal_v,220) * 1.10),
    (new.id, 'rot',  coalesce(new.rpm_nominal,1740) * 1.03, coalesce(new.rpm_nominal,1740) * 1.06)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_regras_padrao on motores;
create trigger trg_regras_padrao after insert on motores
  for each row execute function criar_regras_padrao();

-- ---------- fase 2: linha de base aprendida ----------
create table if not exists baseline_motor (
  motor_id uuid not null references motores(id) on delete cascade,
  grandeza text not null,
  hora smallint not null,                 -- 0..23
  dia_semana smallint not null,           -- 0..6
  faixa_rpm integer not null default -1,  -- -1 = sem rotação medida (velocidade nominal assumida)
  media numeric not null,
  desvio numeric not null,
  n integer not null,
  atualizado_em timestamptz not null default now(),
  primary key (motor_id, grandeza, hora, dia_semana, faixa_rpm)
);

-- recalcula a linha de base de um motor com os últimos N dias
create or replace function atualizar_baseline(p_motor uuid, p_dias integer default 14) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_n integer;
begin
  delete from baseline_motor where motor_id = p_motor;
  insert into baseline_motor (motor_id, grandeza, hora, dia_semana, faixa_rpm, media, desvio, n)
  select motor_id, g.grandeza,
         extract(hour from ts)::smallint,
         extract(dow  from ts)::smallint,
         case when rot is null then -1 else (floor(rot / 100) * 100)::integer end,
         avg(g.valor), coalesce(stddev_samp(g.valor), 0), count(*)
  from leituras l
  cross join lateral (values ('temp', l.temp), ('corr', l.corr), ('vib', l.vib), ('tens', l.tens), ('rot', l.rot)) as g(grandeza, valor)
  where l.motor_id = p_motor and l.valida and g.valor is not null
    and l.ts >= now() - make_interval(days => p_dias)
  group by 1,2,3,4,5
  having count(*) >= 30;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- maturidade do aprendizado por motor (alimenta "Aprendendo · X de 14 dias")
create or replace view status_aprendizado as
select m.id as motor_id,
       min(l.ts) as inicio,
       least(14, coalesce(extract(day from now() - min(l.ts)), 0))::integer as dias,
       count(l.id) as n_leituras,
       case when count(l.id) = 0 then 1
            when now() - min(l.ts) < interval '14 days' then 1
            when now() - min(l.ts) < interval '30 days' then 2
            else 3 end as fase,
       (m.aplicacao = 'multispeed' and not coalesce(c.mede_rot,false)) as aviso_multispeed
from motores m
left join coletores c on c.motor_id = m.id
left join leituras l on l.motor_id = m.id and l.valida
group by m.id, m.aplicacao, c.mede_rot;

-- ---------- anomalias, alertas, ações corretivas ----------
create table if not exists acoes_corretivas (
  id uuid primary key default gen_random_uuid(),
  padrao text not null,                   -- sobrecarga | rolamento | desalinhamento | ventilacao | sensor
  ordem smallint not null default 1,
  titulo text not null,
  descricao text not null,
  unique (padrao, ordem)
);

create table if not exists anomalias (
  id uuid primary key default gen_random_uuid(),
  motor_id uuid not null references motores(id) on delete cascade,
  ts_inicio timestamptz not null default now(),
  ts_fim timestamptz,
  padrao text not null,
  severidade text not null check (severidade in ('atencao','critico')),
  indice numeric,                         -- índice de anomalia (σ combinado)
  fase smallint not null default 1,       -- 1 limites fixos · 2 linha de base · 3 padrão
  confianca numeric,                      -- 0..1
  detalhes jsonb not null default '{}'::jsonb
);
create index if not exists anomalias_motor_ts on anomalias (motor_id, ts_inicio desc);

create table if not exists alertas (
  id uuid primary key default gen_random_uuid(),
  anomalia_id uuid references anomalias(id) on delete set null,
  motor_id uuid not null references motores(id) on delete cascade,
  severidade text not null check (severidade in ('atencao','critico')),
  titulo text not null,
  mensagem text,
  status text not null default 'ativo' check (status in ('ativo','reconhecido','resolvido','silenciado')),
  reconhecido_por uuid references perfis(id),
  reconhecido_em timestamptz,
  acao_registrada text,
  criado_em timestamptz not null default now()
);
create index if not exists alertas_motor_status on alertas (motor_id, status);

insert into acoes_corretivas (padrao, ordem, titulo, descricao) values
  ('sobrecarga', 1, 'Reduzir a carga mecânica aplicada ao eixo', 'Na bancada: afrouxar o freio de carga até a vibração voltar abaixo de 2,8 mm/s.'),
  ('sobrecarga', 2, 'Verificar alinhamento e rolamentos', 'Se a vibração persistir com carga normal.'),
  ('sobrecarga', 3, 'Parar o motor', 'Se a corrente ultrapassar 125 % de In por mais de 30 s.'),
  ('rolamento', 1, 'Inspecionar rolamentos e lubrificação', 'Vibração elevada com corrente estável indica causa mecânica.'),
  ('ventilacao', 1, 'Limpar a ventoinha e as aletas da carcaça', 'Temperatura subindo com corrente e vibração normais.'),
  ('sensor', 1, 'Verificar a fixação e o cabo do sensor', 'Pico isolado em uma grandeza sem correlação nas demais.')
on conflict do nothing;

-- ---------- ingestão (POST HTTPS via PostgREST RPC ou Edge Function) ----------
-- payload: {"motor":"M-01","ts":"...","temp":58.1,"corr":9.4,"vib":2.6,"rot":1748,"tens":219}
-- search_path inclui "extensions": no Supabase o pgcrypto (digest) vive lá
create or replace function ingest(p_token text, p jsonb) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_col coletores%rowtype;
  v_id bigint;
  v_temp numeric := (p->>'temp')::numeric;
  v_corr numeric := (p->>'corr')::numeric;
  v_vib  numeric := (p->>'vib')::numeric;
  v_tens numeric := (p->>'tens')::numeric;
  v_rot  numeric := (p->>'rot')::numeric;
  v_valida boolean := true;
  r record;
  v_sev text;
begin
  select * into v_col from coletores where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then raise exception 'token inválido' using errcode = '28000'; end if;

  -- validação física (UC01/UC05): fora de faixa plausível = leitura descartada
  if v_temp is not null and (v_temp < -20 or v_temp > 200) then v_valida := false; end if;
  if v_corr is not null and (v_corr < 0 or v_corr > 500) then v_valida := false; end if;
  if v_vib  is not null and (v_vib  < 0 or v_vib  > 100) then v_valida := false; end if;

  insert into leituras (motor_id, ts, temp, corr, vib, tens, rot, valida)
  values (v_col.motor_id, coalesce((p->>'ts')::timestamptz, now()), v_temp, v_corr, v_vib, v_tens, v_rot, v_valida)
  returning id into v_id;

  update coletores set ultimo_contato = now(),
    mede_rot = mede_rot or v_rot is not null,
    mede_tens = mede_tens or v_tens is not null
  where id = v_col.id;

  -- fase 1: limites fixos, só se não houver alerta ativo para o motor
  if v_valida and not exists (select 1 from alertas where motor_id = v_col.motor_id and status = 'ativo') then
    for r in select grandeza, limite_atencao, limite_critico from regras_diagnostico where motor_id = v_col.motor_id loop
      v_sev := null;
      if r.grandeza = 'vib'  and v_vib  >= r.limite_critico then v_sev := 'critico';
      elsif r.grandeza = 'corr' and v_corr >= r.limite_critico then v_sev := 'critico';
      elsif r.grandeza = 'temp' and v_temp >= r.limite_critico then v_sev := 'critico';
      end if;
      if v_sev is not null then
        insert into alertas (motor_id, severidade, titulo, mensagem)
        values (v_col.motor_id, v_sev, r.grandeza || ' acima do limite crítico', 'Fase 1 (limites fixos). Verifique a ação corretiva sugerida.');
        exit;
      end if;
    end loop;
  end if;

  return v_id;
end $$;

-- ---------- segurança (RLS) ----------
alter table contas enable row level security;
alter table perfis enable row level security;
alter table motores enable row level security;
alter table coletores enable row level security;
alter table leituras enable row level security;
alter table regras_diagnostico enable row level security;
alter table baseline_motor enable row level security;
alter table anomalias enable row level security;
alter table alertas enable row level security;
alter table acoes_corretivas enable row level security;

create policy "conta: membros leem" on contas for select using (id = conta_atual());
create policy "perfil: dono" on perfis for all using (id = auth.uid()) with check (id = auth.uid());
create policy "motores: conta" on motores for all using (conta_id = conta_atual()) with check (conta_id = conta_atual());
create policy "coletores: conta" on coletores for all
  using (motor_id in (select id from motores where conta_id = conta_atual()))
  with check (motor_id in (select id from motores where conta_id = conta_atual()));
create policy "leituras: conta" on leituras for select using (motor_id in (select id from motores where conta_id = conta_atual()));
create policy "regras: conta" on regras_diagnostico for all
  using (motor_id in (select id from motores where conta_id = conta_atual()))
  with check (motor_id in (select id from motores where conta_id = conta_atual()));
create policy "baseline: conta" on baseline_motor for select using (motor_id in (select id from motores where conta_id = conta_atual()));
create policy "anomalias: conta" on anomalias for select using (motor_id in (select id from motores where conta_id = conta_atual()));
create policy "alertas: conta" on alertas for all
  using (motor_id in (select id from motores where conta_id = conta_atual()))
  with check (motor_id in (select id from motores where conta_id = conta_atual()));
create policy "acoes: publico autenticado" on acoes_corretivas for select to authenticated using (true);

-- ingest é chamada pelo dispositivo com a chave anon + token próprio
grant execute on function ingest(text, jsonb) to anon, authenticated;
grant execute on function atualizar_baseline(uuid, integer) to authenticated;

-- realtime para o painel
alter publication supabase_realtime add table leituras, alertas;
