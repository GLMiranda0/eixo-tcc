-- Teste da migração 004. Termina SEMPRE com um erro proposital que lista os resultados,
-- e o erro desfaz tudo (usuários, empresa, convite e motor de teste não ficam no banco).
-- No SQL editor do Supabase, rode depois da migração 004, ou cole a migração antes deste
-- arquivo para um ensaio completo sem gravar nada. Procure "FALHOU" na mensagem do erro.

create temp table resultado (teste text, ok boolean, detalhe text);
grant all on resultado to authenticated;

-- T1 · CNPJ: numérico válido, alfanumérico válido (exemplo da RFB), dígito errado, repetido
insert into resultado values
  ('T1a cnpj numérico válido', cnpj_valido('11.222.333/0001-81'), null),
  ('T1b cnpj alfanumérico válido', cnpj_valido('12.ABC.345/01DE-35'), null),
  ('T1c cnpj dígito errado', not cnpj_valido('11.222.333/0001-82'), null),
  ('T1d cnpj repetido', not cnpj_valido('11111111111111'), null);

-- T2 · novo usuário nasce sem empresa, papel comum
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('00000000-0000-4000-8000-0000000000a1', 'teste004.master@exemplo.com', '{"nome":"Maria Teste"}', 'authenticated', 'authenticated');
insert into resultado
select 'T2 perfil sem empresa', conta_id is null and papel = 'comum' and nome = 'Maria Teste', papel from perfis where id = '00000000-0000-4000-8000-0000000000a1';

-- T3 · sem convite → sem_empresa; cadastrar_empresa cria a conta e vira master
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
insert into resultado select 'T3a vincular sem convite', vincular_convite() = 'sem_empresa', null;
do $$ begin
  perform cadastrar_empresa('Teste', 'Teste Ltda', '00.000.000/0001-00');
  insert into resultado values ('T3b cnpj inválido recusado', false, 'aceitou');
exception when others then
  insert into resultado values ('T3b cnpj inválido recusado', true, sqlerrm);
end $$;
insert into resultado select 'T3c cadastrar_empresa', cadastrar_empresa('Metalúrgica 004', 'Metalúrgica 004 Ltda.', '11.222.333/0001-81') is not null, null;
reset role;
insert into resultado
select 'T3d virou master da empresa', p.papel = 'master' and c.razao_social = 'Metalúrgica 004 Ltda.' and c.cnpj = '11222333000181', c.nome
from perfis p join contas c on c.id = p.conta_id where p.id = '00000000-0000-4000-8000-0000000000a1';

-- T4 · CNPJ repetido recusado
insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-0000000000a3', 'teste004.outro@exemplo.com', 'authenticated', 'authenticated');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
do $$ begin
  perform cadastrar_empresa('Outra', 'Outra Ltda', '11222333000181');
  insert into resultado values ('T4 cnpj repetido recusado', false, 'aceitou');
exception when others then
  insert into resultado values ('T4 cnpj repetido recusado', true, sqlerrm);
end $$;

-- T5 · master convida; convidado cria a conta (perfil sem empresa) e só entra ao chamar vincular_convite
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
insert into convites (conta_id, email, papel, criado_por)
select conta_id, 'teste004.admin@exemplo.com', 'admin', id from perfis where id = '00000000-0000-4000-8000-0000000000a1';
reset role;
insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-0000000000a2', 'Teste004.Admin@exemplo.com', 'authenticated', 'authenticated');
insert into resultado
select 'T5a convite ainda pendente após criar a conta', aceito_em is null, null from convites where email = 'teste004.admin@exemplo.com';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
insert into resultado select 'T5b vincular com convite', vincular_convite('João Admin') = 'convite', null;
reset role;
insert into resultado
select 'T5c entrou como admin na empresa', p.papel = 'admin' and p.nome = 'João Admin' and p.conta_id = m.conta_id and c.aceito_em is not null, p.papel
from perfis p, perfis m, convites c
where p.id = '00000000-0000-4000-8000-0000000000a2' and m.id = '00000000-0000-4000-8000-0000000000a1' and c.email = 'teste004.admin@exemplo.com';

-- T6 · auditoria: convite e mudança de papel são eventos; criação de usuário e aceite são automáticos
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
update perfis set papel = 'comum' where id = '00000000-0000-4000-8000-0000000000a2';
insert into motores (conta_id, tag, nome, aplicacao) select conta_id, 'T-004', 'Motor teste', 'fixa' from perfis where id = '00000000-0000-4000-8000-0000000000a1';
reset role;
insert into resultado
select 'T6a eventos da empresa', array_agg(distinct evento order by evento) = array['convite','motor_cadastro','usuario_papel'], array_to_string(array_agg(distinct evento order by evento), ',')
from auditoria where conta_id = (select conta_id from perfis where id = '00000000-0000-4000-8000-0000000000a1') and evento is not null;
insert into resultado
select 'T6b automáticos sem evento', bool_and(evento is null), count(*)::text
from auditoria a where (a.tabela = 'perfis' and a.operacao = 'INSERT' and a.registro_id like '00000000-0000-4000-8000-0000000000a%')
   or (a.tabela = 'convites' and a.operacao = 'UPDATE' and a.depois->>'email' = 'teste004.admin@exemplo.com')
   or (a.tabela = 'regras_diagnostico' and a.operacao = 'INSERT' and a.ts = now());

-- T7 · comum (João, agora comum) lê os eventos da empresa, mas não os automáticos
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
insert into resultado
select 'T7 comum vê só eventos', count(*) > 0 and bool_and(evento is not null), count(*)::text from auditoria;
reset role;

do $$ begin
  raise exception E'RESULTADO (erro proposital, nada foi gravado)
%',
    (select string_agg(format('%s  %s%s', case when ok then 'ok    ' else 'FALHOU' end, teste,
                              coalesce('  (' || detalhe || ')', '')), E'
' order by teste) from resultado);
end $$;
