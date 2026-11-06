# Eixo · Sistema Inteligente de Supervisão e Diagnóstico de Motores Elétricos

TCC · Engenharia da Computação · Universidade São Judas Tadeu · 2026

Plataforma web para supervisão de motores elétricos: coleta corrente, temperatura e vibração (ESP32 ou coletor de terceiro, via POST HTTPS ou MQTT), aprende o "normal" de cada motor e emite alertas com ação corretiva.

**Acesse:** <https://eixomotores.cloud> (publicado em 06/11/2026; o Guia interativo dispensa hardware).

| Pasta | Conteúdo |
|---|---|
| `app/` | Front-end (Vite + React + TypeScript + Supabase). Veja `app/README.md`. |
| `prototipos/` | Protótipo de telas (`eixo-prototipo.html`), estudo de viabilidade (`VIABILIDADE.md`) |
| `prototipos/supabase/` | `schema.sql` (banco) e migrações `002_papeis_auditoria.sql`, `003_ingestao_lotes_persistencia.sql`, `004_cadastro_empresa_convites_auditoria.sql`, aplicadas nessa ordem; `functions/convidar` (Edge Function do convite por e-mail); `emails/` (templates do Supabase Auth); `teste.md` (dados e usuário de teste) |
| `Documentos/Documento de Software.docx` | **Documento de Software**: requisitos funcionais e não funcionais, casos de uso, arquitetura, modelo de dados, método de diagnóstico, plano experimental e estado das evidências, alinhados ao protótipo implementado |
| `Documentos/Artigo.docx` | **Artigo** para envio a periódico, após aprovação do orientador |

## Repositório complementar

O coletor de campo (firmware ESP32, sensores e cases impressos) está em **[GLMiranda0/Coletor-eixo](https://github.com/GLMiranda0/Coletor-eixo)**. Ele envia as leituras para a função `ingest` deste projeto.

## Começar

```bash
cd app
cp .env.example .env   # preencha com a URL e a chave publicável do Supabase
npm install
npm run dev
```

Para publicar uma nova versão no site, veja "Publicação" em `app/README.md`.

## Equipe

Mateus Balbino Alves · Cauan Rodrigues de Oliveira Leite · Lucas Rodrigues Zajac · Gabriel Lima Miranda · Victor Brito Pinheiro · Pedro Henrique Gomes Pereira

Orientador: Prof. Nelson Aguiar
