-- Testes da migração 003 (ingest em lote, deduplicação, persistência, atraso, extras, qualidade, Pearson).
-- Rodar num banco novo, depois de 00_stubs_supabase.sql, schema.sql, 002 e 003. Cada bloco imprime o esperado no nome da coluna.
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000aa','t@x','{"nome":"T","empresa":"Emp"}');
insert into motores (id, conta_id, tag, nome, corrente_nominal_a) select '00000000-0000-0000-0000-000000000011', conta_id, 'M-01', 'Bancada', 3.0 from perfis limit 1;
insert into coletores (motor_id, token_hash) values ('00000000-0000-0000-0000-000000000011', encode(sha256('tok'::bytea),'hex'));
select grandeza, limite_critico, persistencia from regras_diagnostico order by grandeza;

\echo '--- T1 formato antigo (objeto), sem seq'
select ingest('tok', jsonb_build_object('ts', now()-interval '60 s','temp',40,'corr',2.1,'vib',1.0)) is not null as t1_ok;

\echo '--- T2 lote: 5 leituras, vib >= 4.5 nas 2 ultimas (persistencia 3 -> sem alerta)'
select ingest('tok', jsonb_build_array(
  jsonb_build_object('ts', now()-interval '10 s','vib',1.0,'corr',2.0,'temp',40,'device_id','c-1','boot',1,'seq',1,'fw','1.1.0'),
  jsonb_build_object('ts', now()-interval '8 s','vib',1.1,'corr',2.1,'temp',40,'device_id','c-1','boot',1,'seq',2),
  jsonb_build_object('ts', now()-interval '6 s','vib',4.4,'corr',2.5,'temp',41,'device_id','c-1','boot',1,'seq',3),
  jsonb_build_object('ts', now()-interval '4 s','vib',4.8,'corr',2.9,'temp',41,'device_id','c-1','boot',1,'seq',4),
  jsonb_build_object('ts', now()-interval '2 s','vib',5.0,'corr',3.0,'temp',42,'device_id','c-1','boot',1,'seq',5,'perdidas',0)));
select count(*) as t2_alertas_esperado_0 from alertas;

\echo '--- T3 reenvio do mesmo lote (seq 4,5) + seq 6 com vib 5.2 -> 1 nova leitura e alerta'
select ingest('tok', jsonb_build_array(
  jsonb_build_object('ts', now()-interval '4 s','vib',4.8,'device_id','c-1','boot',1,'seq',4),
  jsonb_build_object('ts', now()-interval '2 s','vib',5.0,'device_id','c-1','boot',1,'seq',5),
  jsonb_build_object('ts', now(),'vib',5.2,'corr',3.1,'temp',42,'device_id','c-1','boot',1,'seq',6)));
select count(*) as t3_leituras_esperado_7 from leituras;
select a.titulo, a.mensagem, an.ts_inicio is not null as tem_inicio, an.detalhes->'regra' as regra, an.detalhes->'valores' as valores
from alertas a join anomalias an on an.id = a.anomalia_id;

\echo '--- T4 reenvio puro -> retorna null'
select ingest('tok', jsonb_build_array(jsonb_build_object('ts', now(),'vib',5.2,'device_id','c-1','boot',1,'seq',6))) as t4_null;

\echo '--- T5 resolve alerta; lote atrasado (10 min) com vib alta -> grava, sem alerta'
update alertas set status='resolvido';
select ingest('tok', jsonb_build_array(
  jsonb_build_object('ts', now()-interval '10 min','vib',9,'device_id','c-1','boot',2,'seq',1),
  jsonb_build_object('ts', now()-interval '598 s','vib',9,'device_id','c-1','boot',2,'seq',2),
  jsonb_build_object('ts', now()-interval '596 s','vib',9,'device_id','c-1','boot',2,'seq',3))) is not null as t5_gravou;
select count(*) filter (where status='ativo') as t5_ativos_esperado_0 from alertas;

\echo '--- T6 idade_ms sem ts'
select ingest('tok', '{"idade_ms":5000,"vib":1.0,"device_id":"c-1","boot":2,"seq":4}');
select round(extract(epoch from recebido_em - ts)) as t6_atraso_s_esperado_5 from leituras where boot=2 and seq=4;

\echo '--- T7 persistencia com vib null no meio -> sem alerta'
select ingest('tok', jsonb_build_array(
  jsonb_build_object('ts', now()-interval '4 s','vib',6,'device_id','c-1','boot',2,'seq',5),
  jsonb_build_object('ts', now()-interval '2 s','corr',2,'device_id','c-1','boot',2,'seq',6),
  jsonb_build_object('ts', now(),'vib',6,'device_id','c-1','boot',2,'seq',7)));
select count(*) filter (where status='ativo') as t7_ativos_esperado_0 from alertas;

\echo '--- T8 leitura fora de faixa marcada invalida e nao conta'
select ingest('tok', '{"vib":150,"device_id":"c-1","boot":2,"seq":8}');
select valida as t8_valida_false from leituras where boot=2 and seq=8;

\echo '--- T9 extras e qualidade'
select extras from leituras where boot=1 and seq in (1,5) order by seq;
select device_id, boot, recebidas, seq_min, seq_max, esperadas, pct_recebidas, invalidas, round(atraso_p95_s::numeric,1) p95 from qualidade_telemetria order by boot;

\echo '--- T10 atributos_janela'
select jsonb_pretty(atributos_janela('00000000-0000-0000-0000-000000000011', now(), 6));

\echo '--- T11 token invalido e payload invalido'
\set ON_ERROR_STOP 0
select ingest('errado', '{"vib":1}');
select ingest('tok', '"texto"');
select ingest('tok', '[1,2]');
\echo '--- T12 permissoes'
select has_function_privilege('anon','avaliar_fase1(uuid,timestamptz)','execute') as anon_fase1_esperado_f,
       has_function_privilege('anon','ingest(text,jsonb)','execute') as anon_ingest_esperado_t;
select tabela, operacao, usuario_email from auditoria where tabela='alertas' order by id;
