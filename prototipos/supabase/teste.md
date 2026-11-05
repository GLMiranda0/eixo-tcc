# Eixo · dados de teste (ambiente de desenvolvimento)

Projeto Supabase: `qcyortrufewhxdyzukyc` · https://qcyortrufewhxdyzukyc.supabase.co

| Registro | Valor |
|---|---|
| Conta | `00000000-0000-0000-0000-000000000001` · Altamira · bancada de testes |
| Motor | `00000000-0000-0000-0000-000000000011` · M-SIM · WEG W22 1 cv · 10,5 A · 1 740 rpm · aplicação fixa · simulado |
| Coletor | tipo eixo · protocolo post |
| Token do coletor (teste) | em `segredos.local.md` (arquivo local, fora do git) |

O token é de teste e pode ser rotacionado a qualquer momento: basta atualizar `coletores.token_hash` com `encode(digest('<novo token>','sha256'),'hex')`.

## Usuários de teste do app (Supabase Auth)

Criados pelo painel Authentication › Users com auto-confirmação em 04/11/2026. Senhas em `segredos.local.md` (arquivo local, fora do git).

| Papel | Empresa | E-mail |
|---|---|---|
| master | Altamira Indústria Metalúrgica | `teste@eixo.local` |
| comum | Altamira Indústria Metalúrgica (entrou por convite) | `comum@eixo.local` |
| master | Empresa B Compressores | `empresab@eixo.local` |
| dev | global, sem empresa | `dev@eixo.local` |

Regras (migração `002_papeis_auditoria.sql`): o cadastro sem convite cria uma empresa e o usuário vira master; com convite pendente para o e-mail, entra na empresa com o papel do convite. Limites por empresa: 1 master, 4 admin, 5 comum. Toda criação, alteração e exclusão em motores, coletores, regras, alertas, usuários, convites e empresa vai para a tabela `auditoria` com quem fez.

Autenticação: confirmação de e-mail obrigatória; senha com mínimo 8 caracteres, maiúscula, minúscula, número e símbolo (validado no app e no Supabase); recuperação por link no e-mail (o código de 6 dígitos só funciona quando houver SMTP próprio com `{{ .Token }}` no modelo "Reset password"). Site URL do Auth apontando para `http://localhost:5173`.

## Rodar o app localmente

```bash
cd app && npm install && npm run dev
```

Abre em http://localhost:5173. As chaves ficam em `app/.env` (chave publicável, segura para o navegador).

## Simular o ESP32 (POST HTTPS)

A chave `ANON_KEY` é a chave publicável do projeto (Project Settings › API Keys).

```bash
curl -s -X POST "https://qcyortrufewhxdyzukyc.supabase.co/rest/v1/rpc/ingest" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_token":"<token do coletor>","p":{"temp":58.1,"corr":9.4,"vib":2.6}}'
```

Resposta: o `id` da leitura gravada. Leitura com `vib` ≥ 4,5 gera um alerta crítico (fase 1).

## Conferir

```sql
select * from leituras where motor_id = '00000000-0000-0000-0000-000000000011' order by ts desc limit 10;
select * from alertas where motor_id = '00000000-0000-0000-0000-000000000011';
select * from status_aprendizado;
```
