-- =====================================================================
-- Eixo · migração 004 · cadastro da empresa depois do login, convites por e-mail
--                      e auditoria com eventos legíveis
-- Aplicar após 003_ingestao_lotes_persistencia.sql. Idempotente.
--
-- O que muda:
--   1. Criar conta não cria mais a empresa. O usuário nasce sem empresa (conta_id null) e,
--      no primeiro acesso, vincular_convite() procura um convite pendente para o e-mail dele:
--        - achou → entra na empresa do convite com o papel do convite;
--        - não achou → o app pede o cadastro da empresa: cadastrar_empresa(nome fantasia,
--          razão social, CNPJ), e o usuário vira master dela.
--      O convite só conta como aceito quando a pessoa entra de fato (antes, contava na hora
--      em que o auth.users era criado, o que o envio do convite por e-mail antecipa).
--   2. contas ganha razao_social; CNPJ validado (numérico ou alfanumérico, IN RFB 2.229/2024)
--      e único entre as empresas.
--   3. auditoria.evento (coluna gerada): classifica as ações manuais que master, admin e comum
--      enxergam. Eventos automáticos (ingestão, criação de usuário, aceite de convite, alertas
--      abertos pelo sistema) ficam só para o dev.
--        motor_cadastro | motor_edicao | motor_exclusao
--        coletor_cadastro | coletor_edicao | coletor_exclusao
--        convite | convite_cancelado | usuario_papel | usuario_ativo
--        alerta_tratativa
-- =====================================================================

-- ---------- 1. contas ----------
alter table contas add column if not exists razao_social text;

create or replace function cnpj_normalizar(p text) returns text
language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'))
$$;

-- CNPJ numérico ou alfanumérico: 12 posições [0-9A-Z] + 2 dígitos verificadores (módulo 11).
-- Valor de cada caractere = código ASCII − 48 (vale para os dígitos e para as letras).
create or replace function cnpj_valido(p text) returns boolean
language plpgsql immutable as $$
declare
  c text := cnpj_normalizar(p);
  p1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  p2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; r int; d1 int; d2 int; i int;
begin
  if c !~ '^[0-9A-Z]{12}[0-9]{2}$' then return false; end if;
  if c ~ '^(.)\1{13}$' then return false; end if;
  s := 0;
  for i in 1..12 loop s := s + (ascii(substr(c, i, 1)) - 48) * p1[i]; end loop;
  r := s % 11; d1 := case when r < 2 then 0 else 11 - r end;
  s := 0;
  for i in 1..13 loop s := s + (ascii(substr(c, i, 1)) - 48) * p2[i]; end loop;
  r := s % 11; d2 := case when r < 2 then 0 else 11 - r end;
  return substr(c, 13, 1)::int = d1 and substr(c, 14, 1)::int = d2;
end $$;

create unique index if not exists contas_cnpj_unico on contas (cnpj) where cnpj is not null;

-- ---------- 2. perfil sem empresa (cadastro pendente) ----------
create or replace function checar_limite_papel() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lim integer; v_n integer;
begin
  if new.papel = 'dev' then
    new.conta_id := null;
    return new;
  end if;
  -- ainda sem empresa: acabou de criar a conta e não cadastrou empresa nem aceitou convite
  if new.conta_id is null then
    return new;
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

-- novo usuário: só o perfil, sem empresa e com o menor papel; a empresa vem depois do login
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, conta_id, nome, papel, email, criado_por)
  values (new.id, null, nullif(trim(new.raw_user_meta_data->>'nome'), ''), 'comum', new.email, new.id)
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------- 3. primeiro acesso: aceitar convite pendente ----------
-- Retorna 'vinculado' (já tinha empresa ou é dev), 'convite' (entrou agora pela empresa do convite)
-- ou 'sem_empresa' (o app deve pedir o cadastro da empresa).
create or replace function vincular_convite(p_nome text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_nome text := nullif(trim(coalesce(p_nome, '')), '');
  v_perfil perfis%rowtype;
  v_conv convites%rowtype;
begin
  if v_uid is null then
    raise exception 'Entre na plataforma para continuar' using errcode = 'P0001';
  end if;
  select email into v_email from auth.users where id = v_uid;

  select * into v_perfil from perfis where id = v_uid;
  if not found then
    insert into perfis (id, conta_id, nome, papel, email, criado_por)
    values (v_uid, null, v_nome, 'comum', v_email, v_uid)
    returning * into v_perfil;
  elsif v_nome is not null and v_perfil.nome is distinct from v_nome then
    update perfis set nome = v_nome where id = v_uid;
  end if;

  if v_perfil.papel = 'dev' or v_perfil.conta_id is not null then
    return 'vinculado';
  end if;

  select * into v_conv from convites
    where lower(email) = lower(v_email) and aceito_em is null
    order by criado_em desc limit 1;
  if not found then
    return 'sem_empresa';
  end if;

  update perfis set conta_id = v_conv.conta_id, papel = v_conv.papel, criado_por = v_conv.criado_por, ativo = true
    where id = v_uid;
  update convites set aceito_em = now(), aceito_por = v_uid where id = v_conv.id;
  return 'convite';
end $$;

-- ---------- 4. cadastro da empresa (quem não tem convite) ----------
create or replace function cadastrar_empresa(p_nome_fantasia text, p_razao_social text, p_cnpj text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_fantasia text := nullif(trim(coalesce(p_nome_fantasia, '')), '');
  v_razao text := nullif(trim(coalesce(p_razao_social, '')), '');
  v_cnpj text := cnpj_normalizar(p_cnpj);
  v_perfil perfis%rowtype;
  v_conta uuid;
begin
  if v_uid is null then
    raise exception 'Entre na plataforma para continuar' using errcode = 'P0001';
  end if;
  -- um convite que chegou depois da criação da conta tem prioridade: entra na empresa do convite
  -- e devolve o id dela (o app confere o papel e avisa). Não pode ser exceção: desfaria o aceite.
  if vincular_convite() = 'convite' then
    return (select conta_id from perfis where id = v_uid);
  end if;
  select * into v_perfil from perfis where id = v_uid;
  if v_perfil.papel = 'dev' then
    raise exception 'O papel Dev não pertence a uma empresa' using errcode = 'P0001';
  end if;
  if v_perfil.conta_id is not null then
    raise exception 'Seu usuário já está ligado a uma empresa' using errcode = 'P0001';
  end if;
  if v_fantasia is null or length(v_fantasia) < 2 then
    raise exception 'Informe o nome fantasia' using errcode = 'P0001';
  end if;
  if v_razao is null or length(v_razao) < 3 then
    raise exception 'Informe a razão social' using errcode = 'P0001';
  end if;
  if not cnpj_valido(v_cnpj) then
    raise exception 'CNPJ inválido. Confira os números.' using errcode = 'P0001';
  end if;
  if exists (select 1 from contas where cnpj = v_cnpj) then
    raise exception 'Já existe uma empresa com este CNPJ. Peça ao master dela um convite para o seu e-mail.' using errcode = 'P0001';
  end if;

  insert into contas (nome, razao_social, cnpj, criado_por)
  values (v_fantasia, v_razao, v_cnpj, v_uid)
  returning id into v_conta;
  update perfis set conta_id = v_conta, papel = 'master', ativo = true where id = v_uid;
  return v_conta;
end $$;

revoke execute on function vincular_convite(text), cadastrar_empresa(text, text, text) from public, anon;
grant execute on function vincular_convite(text), cadastrar_empresa(text, text, text) to authenticated;
grant execute on function cnpj_valido(text), cnpj_normalizar(text) to authenticated;

-- ---------- 5. auditoria: eventos legíveis ----------
-- Só ações feitas por uma pessoa (usuario_id preenchido) e só as que interessam à empresa.
-- A ingestão também roda com o usuário logado no modo simulação; por isso o coletor só conta
-- como editado quando ultimo_contato NÃO mudou (a ingestão sempre atualiza ultimo_contato).
create or replace function auditoria_evento(p_tabela text, p_operacao text, p_usuario uuid, p_antes jsonb, p_depois jsonb)
returns text language sql immutable as $$
  select case
    when p_usuario is null then null
    when p_tabela = 'motores' then
      case p_operacao when 'INSERT' then 'motor_cadastro' when 'UPDATE' then 'motor_edicao' when 'DELETE' then 'motor_exclusao' end
    when p_tabela = 'coletores' then
      case p_operacao
        when 'INSERT' then 'coletor_cadastro'
        when 'DELETE' then 'coletor_exclusao'
        when 'UPDATE' then
          case when (p_antes -> 'ultimo_contato') is not distinct from (p_depois -> 'ultimo_contato') then 'coletor_edicao' end
      end
    when p_tabela = 'convites' then
      case p_operacao when 'INSERT' then 'convite' when 'DELETE' then 'convite_cancelado' end
    when p_tabela = 'perfis' and p_operacao = 'UPDATE' and (p_antes ->> 'id') is distinct from p_usuario::text
         and (p_antes ->> 'conta_id') is not distinct from (p_depois ->> 'conta_id') then
      case
        when (p_antes -> 'papel') is distinct from (p_depois -> 'papel') then 'usuario_papel'
        when (p_antes -> 'ativo') is distinct from (p_depois -> 'ativo') then 'usuario_ativo'
      end
    when p_tabela = 'alertas' and p_operacao = 'UPDATE'
         and ((p_antes -> 'status') is distinct from (p_depois -> 'status')
              or (p_antes -> 'acao_registrada') is distinct from (p_depois -> 'acao_registrada')) then 'alerta_tratativa'
  end
$$;

alter table auditoria add column if not exists evento text
  generated always as (auditoria_evento(tabela, operacao, usuario_id, antes, depois)) stored;
create index if not exists auditoria_conta_evento_ts on auditoria (conta_id, ts desc) where evento is not null;

-- master, admin e comum leem os eventos da própria empresa; dev lê tudo (inclusive automáticos)
drop policy if exists "auditoria: ler" on auditoria;
create policy "auditoria: ler" on auditoria for select
  using (is_dev() or (conta_id = conta_atual() and evento is not null));
