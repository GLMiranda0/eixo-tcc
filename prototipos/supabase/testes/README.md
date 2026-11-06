# Testes do banco (PostgreSQL local)

Exercitam `schema.sql` + migrações num PostgreSQL comum (15 ou superior), sem o Supabase.
`00_stubs_supabase.sql` cria o mínimo que o Supabase fornece (roles `anon`/`authenticated`,
`auth.users`, `auth.uid()`, `extensions.digest()` e a publicação do Realtime).

```bash
createdb eixo_teste
psql -d eixo_teste -v ON_ERROR_STOP=1 -f 00_stubs_supabase.sql
grep -v "create extension if not exists pgcrypto" ../schema.sql | psql -d eixo_teste -v ON_ERROR_STOP=1
psql -d eixo_teste -v ON_ERROR_STOP=1 -f ../002_papeis_auditoria.sql
psql -d eixo_teste -v ON_ERROR_STOP=1 -f ../003_ingestao_lotes_persistencia.sql
psql -d eixo_teste -f 003_ingest.sql
```

`004_cadastro_convites.sql` exige o `auth.users` real do Supabase: rode no SQL editor, depois da migração 004 (ou colado logo após ela, como ensaio). Ele termina sempre com um erro proposital que lista os 16 testes e desfaz tudo. Em 06/11/2026, no projeto de produção, os 16 passaram (ensaio sem gravar).

O `grep` tira a criação do `pgcrypto` porque o stub já fornece `extensions.digest()`.
Os erros no fim da saída (token inválido, payload inválido) são esperados: o teste T11 os provoca.

Resultado esperado de `003_ingest.sql` (rodado em 05/11/2026, PostgreSQL 16.2):

| Teste | Esperado |
|---|---|
| T2 | lote com 2 leituras acima de 4,5 mm/s: nenhum alerta (persistência 3) |
| T3 | reenvio de `seq` 4 e 5 ignorado; a 3ª leitura seguida acima do limite abre 1 alerta, com a regra e os valores na anomalia |
| T4 | reenvio puro devolve `null` |
| T5 | lote com 10 min de atraso é gravado e não abre alerta |
| T6 | `idade_ms` = 5000 vira `ts` 5 s antes da chegada |
| T7 | leitura sem `vib` no meio interrompe a persistência |
| T8 | `vib` = 150 é gravada com `valida = false` |
| T9 | `fw` e `perdidas` em `extras`; `qualidade_telemetria` com 100 % recebidas |
| T10 | `atributos_janela` com médias, Δ e Pearson; `null` onde não há rotação |
| T11 | token inválido, payload texto e lote de números são rejeitados |
| T12 | `anon` executa `ingest`, mas não `avaliar_fase1`; inserções em `alertas` aparecem na auditoria como "sistema" |
