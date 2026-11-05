-- =====================================================================
-- Eixo · migração 003 · ingestão em lote, idempotência e persistência dos alertas
-- Aplicar após 002_papeis_auditoria.sql. Idempotente.
--
-- O que muda:
--   1. leituras guarda a hora de chegada (recebido_em), a identificação do pacote
--      (device_id, boot, seq) e os campos extras do coletor (extras).
--   2. ingest(p_token, p) aceita um objeto (formato antigo) ou uma lista de leituras (lote).
--      Reenvio de uma leitura já gravada (mesmo device_id, boot, seq) é ignorado.
--      Leitura sem "ts" pode trazer "idade_ms": ts = chegada − idade.
--   3. Fase 1 com persistência: o alerta só sai quando as N últimas leituras válidas
--      (regras_diagnostico.persistencia, padrão 3) passam do limite crítico, em no máximo 2 min.
--      Leitura com mais de 60 s de atraso (lote retido na reconexão) é gravada, mas não gera alerta.
--      Cada alerta aponta para uma anomalia com a cópia da regra usada (limites e persistência).
--   4. atributos_janela(): médias, tendência entre meias-janelas e Pearson das últimas N leituras.
--   5. qualidade_telemetria: recebidas × esperadas pela sequência e atraso aquisição → banco.
--
-- Firmware do coletor Eixo >= 1.1.0 envia em lote; versões anteriores continuam funcionando.
-- =====================================================================

-- ---------- 1. leituras ----------
-- recebido_em sem default no ADD: leituras antigas ficam null (hora de chegada desconhecida)
alter table leituras add column if not exists recebido_em timestamptz;
alter table leituras alter column recebido_em set default now();
alter table leituras add column if not exists device_id text;
alter table leituras add column if not exists boot integer;
alter table leituras add column if not exists seq bigint;
alter table leituras add column if not exists extras jsonb;
-- nulls nunca conflitam: leituras sem seq (coletor antigo, simulador) não são deduplicadas
create unique index if not exists leituras_pacote_unico on leituras (motor_id, device_id, boot, seq);

-- ---------- 2. persistência por regra ----------
alter table regras_diagnostico add column if not exists persistencia smallint not null default 3;
alter table regras_diagnostico drop constraint if exists regras_persistencia_check;
alter table regras_diagnostico add constraint regras_persistencia_check check (persistencia between 1 and 30);

-- ---------- 3. avaliação da fase 1 (limites fixos + persistência) ----------
create or replace function avaliar_fase1(p_motor uuid, p_ts timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_vals numeric[];
  v_tss timestamptz[];
  v_anom uuid;
  v_alerta uuid;
begin
  -- serializa por motor: dois lotes simultâneos não abrem dois alertas
  perform pg_advisory_xact_lock(hashtext('eixo-fase1-' || p_motor::text));

  if exists (select 1 from alertas where motor_id = p_motor and status = 'ativo') then
    return null;
  end if;

  for r in
    select id, grandeza, limite_atencao, limite_critico, persistencia, origem
    from regras_diagnostico
    where motor_id = p_motor and grandeza in ('vib', 'corr', 'temp')
    order by case grandeza when 'vib' then 1 when 'corr' then 2 else 3 end
  loop
    select array_agg(u.v order by u.ts desc), array_agg(u.ts order by u.ts desc)
      into v_vals, v_tss
    from (
      select l.ts, case r.grandeza when 'vib' then l.vib when 'corr' then l.corr else l.temp end as v
      from leituras l
      where l.motor_id = p_motor and l.valida and l.ts <= p_ts
      order by l.ts desc
      limit r.persistencia
    ) u;

    -- grandeza ausente numa das leituras (null) não conta como excedência
    if coalesce(array_length(v_vals, 1), 0) = r.persistencia
       and p_ts - v_tss[r.persistencia] <= interval '2 minutes'
       and (select bool_and(coalesce(x >= r.limite_critico, false)) from unnest(v_vals) as x)
    then
      insert into anomalias (motor_id, ts_inicio, padrao, severidade, fase, detalhes)
      values (p_motor, v_tss[r.persistencia],
              case r.grandeza when 'temp' then 'ventilacao' else 'sobrecarga' end,
              'critico', 1,
              jsonb_build_object(
                'grandeza', r.grandeza,
                'valores', to_jsonb(v_vals),
                'ts', to_jsonb(v_tss),
                'regra', jsonb_build_object(
                  'id', r.id,
                  'limite_atencao', r.limite_atencao,
                  'limite_critico', r.limite_critico,
                  'persistencia', r.persistencia,
                  'origem', r.origem)))
      returning id into v_anom;

      insert into alertas (anomalia_id, motor_id, severidade, titulo, mensagem)
      values (v_anom, p_motor, 'critico', r.grandeza || ' acima do limite crítico',
              format('Fase 1 (limites fixos): %s leituras seguidas ≥ %s. Verifique a ação corretiva sugerida.',
                     r.persistencia, r.limite_critico))
      returning id into v_alerta;
      return v_alerta;
    end if;
  end loop;
  return null;
end $$;

-- ---------- 4. ingestão (objeto ou lote) ----------
-- payload antigo: {"temp":58.1,"corr":9.4,"vib":2.6}
-- lote:           [{"ts":"...","temp":..,"corr":..,"vib":..,"device_id":"coletor-a1b2c3","boot":7,"seq":120}, ...]
create or replace function ingest(p_token text, p jsonb) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_col coletores%rowtype;
  v_itens jsonb;
  v_item jsonb;
  v_id bigint;
  v_ultimo bigint;
  v_ts timestamptz;
  v_temp numeric;
  v_corr numeric;
  v_vib numeric;
  v_tens numeric;
  v_rot numeric;
  v_valida boolean;
  v_extras jsonb;
  v_tem_rot boolean := false;
  v_tem_tens boolean := false;
begin
  select * into v_col from coletores where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then raise exception 'token inválido' using errcode = '28000'; end if;

  v_itens := case jsonb_typeof(p) when 'array' then p when 'object' then jsonb_build_array(p) end;
  if v_itens is null then
    raise exception 'payload deve ser um objeto ou uma lista de leituras' using errcode = '22023';
  end if;
  if jsonb_array_length(v_itens) > 200 then
    raise exception 'lote acima de 200 leituras' using errcode = '22023';
  end if;

  -- o coletor manda o lote em ordem de aquisição
  for v_item in select value from jsonb_array_elements(v_itens) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'cada leitura do lote deve ser um objeto' using errcode = '22023';
    end if;

    v_temp := (v_item->>'temp')::numeric;
    v_corr := (v_item->>'corr')::numeric;
    v_vib  := (v_item->>'vib')::numeric;
    v_tens := (v_item->>'tens')::numeric;
    v_rot  := (v_item->>'rot')::numeric;
    v_ts := coalesce((v_item->>'ts')::timestamptz,
                     now() - make_interval(secs => (v_item->>'idade_ms')::double precision / 1000),
                     now());

    -- validação física (UC01/UC05): fora de faixa plausível = leitura descartada
    v_valida := true;
    if v_temp is not null and (v_temp < -20 or v_temp > 200) then v_valida := false; end if;
    if v_corr is not null and (v_corr < 0 or v_corr > 500) then v_valida := false; end if;
    if v_vib  is not null and (v_vib  < 0 or v_vib  > 100) then v_valida := false; end if;

    v_extras := v_item - array['ts', 'idade_ms', 'temp', 'corr', 'vib', 'tens', 'rot', 'device_id', 'boot', 'seq'];
    if v_extras = '{}'::jsonb then v_extras := null; end if;

    v_id := null;
    insert into leituras (motor_id, ts, temp, corr, vib, tens, rot, valida, device_id, boot, seq, extras)
    values (v_col.motor_id, v_ts, v_temp, v_corr, v_vib, v_tens, v_rot, v_valida,
            v_item->>'device_id', (v_item->>'boot')::integer, (v_item->>'seq')::bigint, v_extras)
    on conflict (motor_id, device_id, boot, seq) do nothing
    returning id into v_id;

    continue when v_id is null;   -- reenvio de leitura já gravada
    v_ultimo := v_id;
    v_tem_rot := v_tem_rot or v_rot is not null;
    v_tem_tens := v_tem_tens or v_tens is not null;

    -- dado atrasado (lote retido durante a queda de rede) não vira alerta "em tempo real"
    if v_valida and v_ts >= now() - interval '60 seconds' then
      perform avaliar_fase1(v_col.motor_id, v_ts);
    end if;
  end loop;

  update coletores set ultimo_contato = now(),
    mede_rot = mede_rot or v_tem_rot,
    mede_tens = mede_tens or v_tem_tens
  where id = v_col.id;

  return v_ultimo;   -- id da última leitura gravada; null se o lote inteiro era reenvio
end $$;

-- ---------- 5. atributos de janela (média, tendência e Pearson) ----------
-- Últimas p_n leituras válidas até p_fim. delta = média da metade recente − média da metade antiga.
-- Pearson null = indefinido (variância zero ou pares insuficientes), nunca 0.
create or replace function atributos_janela(p_motor uuid, p_fim timestamptz default now(), p_n integer default 30)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with u as (
    select ts, temp as t, corr as i, vib as v, rot as n
    from leituras
    where motor_id = p_motor and valida and ts <= p_fim
    order by ts desc
    limit greatest(p_n, 4)
  ), o as (
    select u.*, row_number() over (order by ts) as k, count(*) over () as tot from u
  )
  select jsonb_build_object(
    'n', coalesce(max(tot), 0),
    'inicio', min(ts),
    'fim', max(ts),
    'duracao_s', extract(epoch from max(ts) - min(ts)),
    'media', jsonb_build_object('temp', avg(t), 'corr', avg(i), 'vib', avg(v), 'rot', avg(n)),
    'delta', jsonb_build_object(
      'temp', avg(t) filter (where k > tot / 2) - avg(t) filter (where k <= tot / 2),
      'corr', avg(i) filter (where k > tot / 2) - avg(i) filter (where k <= tot / 2),
      'vib',  avg(v) filter (where k > tot / 2) - avg(v) filter (where k <= tot / 2),
      'rot',  avg(n) filter (where k > tot / 2) - avg(n) filter (where k <= tot / 2)),
    'pearson', jsonb_build_object(
      'corr_vib', corr(i, v),
      'corr_temp', corr(i, t),
      'temp_vib', corr(t, v),
      'corr_rot', corr(i, n),
      'rot_vib', corr(n, v)),
    'pares_validos', jsonb_build_object(
      'corr_vib', count(*) filter (where i is not null and v is not null),
      'corr_temp', count(*) filter (where i is not null and t is not null),
      'temp_vib', count(*) filter (where t is not null and v is not null)))
  from o;
$$;

-- ---------- 6. qualidade da telemetria (disponibilidade e atraso) ----------
-- esperadas = faixa de seq recebida no boot; perdas no começo do boot não aparecem aqui
-- (o coletor também manda o contador "perdidas" em extras).
create or replace view qualidade_telemetria with (security_invoker = true) as
select motor_id, device_id, boot,
       count(*) as recebidas,
       min(seq) as seq_min,
       max(seq) as seq_max,
       max(seq) - min(seq) + 1 as esperadas,
       round(100.0 * count(*) / nullif(max(seq) - min(seq) + 1, 0), 2) as pct_recebidas,
       count(*) filter (where not valida) as invalidas,
       min(ts) as primeira,
       max(ts) as ultima,
       percentile_cont(0.5) within group (order by extract(epoch from recebido_em - ts)::double precision) as atraso_p50_s,
       percentile_cont(0.95) within group (order by extract(epoch from recebido_em - ts)::double precision) as atraso_p95_s
from leituras
where seq is not null and recebido_em is not null
group by motor_id, device_id, boot;

-- ---------- 7. grants ----------
-- avaliar_fase1 só é chamada de dentro do ingest
revoke execute on function avaliar_fase1(uuid, timestamptz) from public, anon, authenticated;
grant execute on function ingest(text, jsonb) to anon, authenticated;
grant execute on function atributos_janela(uuid, timestamptz, integer) to authenticated;
grant select on qualidade_telemetria to authenticated;
