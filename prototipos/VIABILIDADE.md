# Eixo · Viabilidade técnica (04/11/2026)

Plataforma web para supervisão de motores elétricos, derivada do Documento de Software do TCC
"Sistema Inteligente de Supervisão e Diagnóstico de Motores Elétricos".

## O que existe hoje na conta Hostinger (hpanel)

| Recurso | Situação | Serve para |
|---|---|---|
| Plano **Single** (hospedagem compartilhada) | Ativo, **expira em 16/11/2026**; site publicado em <https://eixomotores.cloud> (06/11/2026) | Hospedar o front-end (HTML/JS estático ou PHP). Não roda Node.js nem MQTT. |
| **VPS KVM 4** (`srv1364001.hstgr.cloud`, 187.77.38.235, Ubuntu 24.04) | **Parado**, válido até 11/02/2027 | Broker MQTT (Mosquitto), API Node, Docker. Sobra recurso. |
| Web Apps (Node.js com deploy via GitHub) | Disponível só em planos Business+ | Alternativa ao VPS se quiserem evitar administrar servidor. |
| Domínio | **eixomotores.cloud**, resgatado em 06/11/2026 (grátis no 1º ano, renova a US$ 25,99/ano em 06/11/2027); verificar o e-mail do titular até 20/11/2026 | Endereço público da plataforma, com SSL Let's Encrypt. |

## Supabase

- Organização já conectada: **Altamira industria Metalurgica**. Nenhum projeto criado ainda.
- Custo de um projeto novo: **R$ 0 / mês (free tier)**. Limites do free: 500 MB Postgres, 50 mil usuários auth, Edge Functions, Realtime, 2 projetos ativos (pausa após 7 dias sem uso).
- Cobre: banco (Postgres + TimescaleDB-like por particionamento), autenticação (e-mail/senha, Google), Realtime (push para o painel sem polling), Edge Functions (endpoint `POST /ingest`), Row Level Security (cada cliente vê só seus motores).
- **Não cobre MQTT.** Supabase não tem broker.

## Arquitetura recomendada (simples, custo zero para começar)

```
ESP32 / coletor de terceiro
   ├─ POST HTTPS ──► Supabase Edge Function /ingest ──► Postgres (leituras)
   └─ MQTT ───────► Mosquitto no VPS Hostinger ──► bridge (Node, 60 linhas) ──► Supabase
                                                                                  │
Painel web (estático, hospedado na Hostinger Single) ◄── Supabase Realtime ◄──────┘
```

1. **Front-end**: SPA estática (Vite + React ou Vue) publicada na hospedagem Single via FTP/Git. Tema claro/escuro, PWA opcional.
2. **Ingestão HTTP**: Edge Function valida token do dispositivo, aplica a regra de validação (faixa física) e grava em `leituras`.
3. **Ingestão MQTT**: Mosquitto no VPS (já pago, parado). Um serviço Node assina `eixo/+/+/telemetry` e chama a mesma função de ingestão. Se quiserem evitar o VPS: HiveMQ Cloud ou EMQX Serverless têm free tier com webhook direto.
4. **Motor de regras**: função SQL/`pg_cron` ou Edge Function agendada que cruza as 5 grandezas (UC05/UC06) e grava `anomalias` + `alertas` + `acoes_corretivas`.
5. **Realtime**: painel assina a tabela `leituras` e `alertas`; latência típica < 1 s (atende RNF01 e HU03 "< 2 s").
6. **Modo simulação / Caminho de Tutorial**: um "coletor virtual" roda no próprio navegador (ou numa Edge Function) e publica no mesmo endpoint, marcado com `simulado = true`. Nada de hardware, mesma tela de produção.

## Indicadores: o que o coletor Eixo mede e o que é opcional

| Grandeza | Coletor Eixo (ESP32) | Coletor do cliente | Uso no diagnóstico |
|---|---|---|---|
| Corrente | sim | se enviar `corr` | carga, sobrecarga, desequilíbrio |
| Temperatura | sim | se enviar `temp` | aquecimento, ventilação, isolação |
| Vibração | sim | se enviar `vib` | rolamento, desalinhamento, desbalanceamento |
| Rotação | **não** | se enviar `rot` | separa a linha de base por faixa de velocidade |
| Tensão | não | se enviar `tens` | sub/sobretensão |

Regra: tudo que chegar no payload é computado. O que não chegar é marcado como "não medido" no painel, nunca estimado em silêncio.

## Motor de diagnóstico em três fases (não só limites fixos)

O termo correto é **modelo de aprendizado estatístico / ML**, não LLM. Um LLM entra só para redigir a explicação do alerta em linguagem natural; a detecção é numérica.

| Fase | Quando | Como | Onde roda |
|---|---|---|---|
| 1. Limites fixos | dia 0 até ~14 dias de dados | ISO 10816-3 (vibração), % da corrente nominal, temperatura por classe de isolação. Válido como categorização inicial. | SQL (trigger ou `pg_cron`) |
| 2. Linha de base aprendida | a partir de ~14 dias | Para cada motor e grandeza: média e desvio por hora do dia e dia da semana (sazonalidade de turno), EWMA para tendência, envelope ±2σ. Alerta quando o índice de anomalia (z-score combinado) passa de 3σ por mais de 2 min. | SQL agregando `leituras` em `baseline_motor` (materialized view) |
| 3. Diagnóstico por padrão | após ~30 dias | Modelo multivariado leve (Isolation Forest ou autoencoder pequeno) treinado no histórico do próprio motor; o padrão de desvio (ex.: vibração ↑ com corrente estável = mecânico; corrente ↑ com vibração ↑ = carga) mapeia para a ação corretiva. | Python no VPS (scikit-learn), agendado a cada hora; grava `anomalias` no Supabase |

Enquanto a fase 2 não está pronta, o painel mostra "Aprendendo · X de 14 dias" e a confiança do alerta é marcada como "fase 1". Picos isolados de um único sensor continuam descartados como provável falha de sensor (UC05).

## Limitação declarada: aplicações multispeed

- A vibração varia com a rotação. Sem leitura de rpm o modelo só é válido para **velocidade nominal constante** (partida direta ou soft-starter).
- O cadastro do motor tem o campo **Aplicação: velocidade fixa | multispeed**. Se for multispeed e o coletor não enviar `rot`, o painel mostra um aviso permanente no motor e na lista, e os alertas de vibração recebem confiança reduzida.
- Se o coletor do cliente enviar `rot` (sensor Hall, encoder ou saída analógica do inversor), o sistema agrupa a linha de base por faixa de velocidade (ex.: bins de 100 rpm) e o aviso some. O coletor Eixo pode ganhar essa entrada numa versão futura sem mudar o backend.

## Modelo de dados (mínimo)

`contas` → `usuarios` → `motores` (dados de placa, rpm nominal, aplicação fixa|multispeed) → `coletores` (tipo: eixo | terceiro; protocolo: post | mqtt; token; indicadores habilitados) → `leituras` (motor_id, ts, temp, corr, vib, tens?, rot?, simulado) → `baseline_motor` (motor_id, grandeza, hora, dia_semana, faixa_rpm?, media, desvio, n) → `regras_diagnostico` → `anomalias` (indice, fase, confianca) → `alertas` → `acoes_corretivas`.

Isso espelha o diagrama de classes do Documento de Software (Operador, Motor, GatewayESP32, Sensor, LeituraSensor, RegraDiagnostico, Anomalia, Alerta, AcaoCorretiva).

## Riscos e decisões pendentes

- **Plano Single expira em 12 dias (16/11).** Renovar, ou servir o front-end pelo próprio VPS (nginx) e dispensar o Single.
- **VPS parado**: ligar só quando forem testar MQTT. Até lá, POST HTTPS resolve 100 % do fluxo do TCC.
- **Free tier do Supabase pausa após 7 dias sem tráfego**: o coletor virtual do modo simulação pode manter o projeto ativo, ou pagam o plano Pro (US$ 25/mês) quando virar produto.
- **Retenção de leituras a 1 Hz × 5 sensores × 3 motores ≈ 1,3 M linhas/dia.** Guardar bruto por 7 dias e agregar por minuto depois disso mantém o banco dentro dos 500 MB por meses.
- Alternativa ainda mais simples que Supabase: Firebase (Firestore + Auth + Functions). Mesmo modelo, mas sem SQL para as regras de correlação. Supabase ganha porque o MCP já está conectado e as regras ficam em SQL.

## Próximos passos sugeridos

1. Criar o projeto Supabase (free) e aplicar o schema acima.
2. Escrever a Edge Function `/ingest` e testar com `curl` simulando o ESP32.
3. Montar o front-end a partir do protótipo `eixo-prototipo.html`.
4. Ligar o VPS, instalar Mosquitto e a bridge MQTT quando o ESP32 estiver pronto.
5. Registrar o domínio grátis e apontar para a hospedagem.
