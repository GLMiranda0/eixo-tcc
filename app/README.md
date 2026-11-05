# Eixo · app web

Front-end da plataforma Eixo (supervisão de motores elétricos). Vite + React + TypeScript + Supabase.

## Rodar

```bash
npm install
npm run dev
```

Abre em http://localhost:5173. As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY` (chave publicável) ficam em `.env`.

## Estrutura

| Pasta/arquivo | O que faz |
|---|---|
| `src/styles.css` | Tokens da identidade visual (tema claro/escuro), botões, cards, gauges |
| `src/lib/supabase.ts` | Cliente Supabase, chamada `ingest` (igual ao ESP32), geração e hash de token |
| `src/lib/sim.ts` | Coletor virtual: reproduz o ensaio da bancada (carga → corrente, vibração) |
| `src/lib/hooks.ts` | Motores, leituras em tempo real (Realtime), alertas, status de aprendizado |
| `src/lib/auth.tsx` | Sessão e perfil do usuário |
| `src/pages/Login.tsx` | Entrar / criar conta / explorar em simulação |
| `src/pages/Painel.tsx` | Visão geral: KPIs, tabela de motores, alertas ativos |
| `src/pages/Motores.tsx` | Lista e cadastro (dados de placa + coletor) |
| `src/pages/Motor.tsx` | Tempo real, histórico, fases do diagnóstico, limites, coletor e token |
| `src/pages/Alertas.tsx` | Diagnóstico, ações corretivas, reconhecer/silenciar |
| `src/pages/Tutorial.tsx` | Caminho de Tutorial com motor e coletor virtuais |
| `src/pages/Usuarios.tsx` | Equipe da empresa (só master): convites, papéis, desativação, limites 1/4/5 |
| `src/pages/Auditoria.tsx` | Registro de operações (master, admin e dev) com diff do que mudou |
| `src/pages/Dev.tsx` | Visão global para suporte (só dev): empresas, contagens e "Abrir quadro" |

## Papéis

| Papel | Quem | Pode |
|---|---|---|
| dev | equipe Eixo | ver todas as empresas e abrir o quadro de qualquer uma, sem editar |
| master | 1 por empresa | tudo do admin + gerenciar usuários e convites |
| admin | até 4 por empresa | cadastrar e editar motores, coletores, regras; reconhecer alertas |
| comum | até 5 por empresa | só visualizar e acompanhar o monitoramento |

Uma empresa nunca enxerga dados de outra (Row Level Security no banco).

## Banco

Schema em `../prototipos/supabase/schema.sql`. Dados e usuário de teste em `../prototipos/supabase/teste.md`.

## Deploy na Hostinger (plano Single)

`npm run build` gera `dist/`. Suba o conteúdo de `dist/` para `public_html` e adicione um `.htaccess` redirecionando tudo para `index.html` (SPA):

```
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```
