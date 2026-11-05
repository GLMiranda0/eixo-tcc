# Eixo · dados de teste (ambiente de desenvolvimento)

Projeto Supabase: `qcyortrufewhxdyzukyc` · https://qcyortrufewhxdyzukyc.supabase.co

| Registro | Valor |
|---|---|
| Conta | `00000000-0000-0000-0000-000000000001` · Altamira · bancada de testes |
| Motor | `00000000-0000-0000-0000-000000000011` · M-SIM · WEG W22 1 cv · 10,5 A · 1 740 rpm · aplicação fixa · simulado |
| Coletor | tipo eixo · protocolo post |
| Token do coletor (teste) | em `segredos.local.md` (arquivo local, fora do git) |

O token é de teste e pode ser rotacionado a qualquer momento: basta atualizar `coletores.token_hash` com `encode(digest('<novo token>','sha256'),'hex')`.

## Usuário de teste do app (Supabase Auth)

| Campo | Valor |
|---|---|
| E-mail | `teste@eixo.local` |
| Senha | em `segredos.local.md` (arquivo local, fora do git) |
| Criado | pelo painel Authentication › Users com auto-confirmação, em 04/11/2026 |

O trigger `handle_new_user` cria automaticamente uma conta própria e o perfil admin para cada usuário novo.

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
