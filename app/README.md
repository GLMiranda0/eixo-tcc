# Eixo · app web

Front-end da plataforma Eixo (supervisão de motores elétricos). Vite + React + TypeScript + Supabase.

Em produção: <https://eixomotores.cloud>

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
| `src/pages/Login.tsx` | Entrar / criar conta (tela de "conta criada, confirme o e-mail") / boas-vindas do convidado / explorar em simulação |
| `src/pages/CadastroEmpresa.tsx` | Primeiro acesso sem convite: nome fantasia, razão social e CNPJ (numérico ou alfanumérico) |
| `src/pages/Painel.tsx` | Visão geral: KPIs, tabela de motores, alertas ativos |
| `src/pages/Motores.tsx` | Lista e cadastro (dados de placa + coletor) |
| `src/pages/Motor.tsx` | Tempo real, histórico, fases do diagnóstico, limites, coletor e token |
| `src/pages/Alertas.tsx` | Diagnóstico, ações corretivas, reconhecer/silenciar |
| `src/pages/Tutorial.tsx` | Caminho de Tutorial com motor e coletor virtuais |
| `src/pages/Usuarios.tsx` | Equipe da empresa (só master): convites por e-mail (Edge Function `convidar`), papéis, desativação, limites 1/4/5 |
| `src/pages/Auditoria.tsx` | Histórico de atividades: master, admin e comum veem eventos em texto (motor + coletor, convites e níveis, tratativa de alertas); o dev vê também os automáticos e a visão técnica (tabela/JSON) |
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

Schema em `../prototipos/supabase/schema.sql`, seguido das migrações `002_papeis_auditoria.sql`, `003_ingestao_lotes_persistencia.sql` (ingestão em lote com `device_id`/`boot`/`seq`, persistência dos alertas da fase 1, `atributos_janela()` e a view `qualidade_telemetria`) e `004_cadastro_empresa_convites_auditoria.sql` (empresa cadastrada no primeiro acesso, convite aceito ao entrar, CNPJ validado, coluna `auditoria.evento`).

## Cadastro, convites e e-mails

1. Criar conta pede só nome, e-mail e senha. O app mostra "Conta criada" e pede a confirmação do e-mail.
2. No primeiro acesso, `vincular_convite()` procura um convite pendente para o e-mail: se houver, a pessoa entra na empresa com o papel do convite; se não, o app abre o cadastro da empresa (`cadastrar_empresa`).
3. O master convida pela tela Usuários. A Edge Function `convidar` (`../prototipos/supabase/functions/convidar/index.ts`, implantada sem "Verify JWT") envia o e-mail de convite; quem já tem conta sem empresa recebe um link de acesso.
4. Os templates dos e-mails ficam em `../prototipos/supabase/emails/` (gerados por `gerar.py`) e são colados em Authentication › Emails › Templates. Para enviar a qualquer destinatário, o Supabase precisa de SMTP próprio (o SMTP padrão só entrega para a equipe do projeto, com poucos envios por hora). Dados e usuário de teste em `../prototipos/supabase/teste.md`.

## Publicação (Hostinger, plano Single)

Site: <https://eixomotores.cloud>, publicado em 06/11/2026. Domínio resgatado no plano (grátis no 1º ano) e certificado TLS Let's Encrypt emitido e renovado pela Hostinger.

Para publicar uma nova versão:

1. `npm run build` (com o `.env` preenchido: a URL e a chave publicável entram no build).
2. No hPanel › Arquivos › Gerenciador de Arquivos, substitua o conteúdo de `public_html` pelo de `dist/`.

O `public/.htaccess` é copiado para `dist/` em todo build. Ele redireciona as rotas da SPA para `index.html`, força HTTPS e define o cache (`index.html` sem cache; JS e CSS com hash por 1 ano).

No Supabase (Authentication › URL Configuration), a Site URL é `https://eixomotores.cloud/`: é para lá que voltam os links de confirmação de conta e de recuperação de senha. Para testar esses fluxos em `localhost`, inclua `http://localhost:5173/**` em Redirect URLs.

Prazos: o plano Single vence em 16/11/2026; o e-mail de titularidade do domínio precisa ser verificado até 20/11/2026.
