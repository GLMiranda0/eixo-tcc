# Sessão de bancada de 24/11/2026 — motor M-01 (WEG 0,37 kW)

Objetivo: **demonstrar que o coletor envia e que a plataforma recebe**, em uma sessão contínua com
o motor ligado, sem carga no eixo. O foco do projeto é a plataforma; o coletor entra como
demonstração de coleta. Não houve anomalia provocada (o plano anterior, de 20 partidas com um
parafuso da base solto, foi abandonado: o motor está em bancada e não havia tempo).

Tudo o que está aqui foi registrado como aconteceu; nada foi ajustado depois.

## Arquivos

- `leituras_M-01_2026-11-24.csv` — as 5.075 leituras do dia, exportadas da tabela `leituras`
  (mesmas colunas da demonstração de 17/11). A sessão é o **boot 40** (4.597 leituras); os boots
  36 a 39 são reinícios do coletor durante a preparação, antes das 10:55.
- `eventos.csv` — o que foi feito no motor e no coletor, com horário de Brasília.
- `calibracao_corrente.csv` — as duas conferências de corrente com o alicate true-RMS.
- `analise.py` — recalcula os números abaixo (`resumo.json`) e gera `figura_sessao.png`.
  Uso: `python analise.py` (Python 3 e matplotlib).

## Condições

| Item | Valor |
|---|---|
| Motor | WEG, carcaça 71, 0,37 kW, 220 V, 2,04 A, 1680 rpm, sem carga no eixo |
| Coletor | `coletor-6ce7b0`, firmware 1.1.1, boot 40, envio a cada 2 s |
| Sensores | SCT-013-005 nas três fases, ADXL345 preso por parafuso, DS18B20 |
| Referência | alicate amperímetro true-RMS (única) |
| Plataforma | https://eixomotores.cloud, limites fixos (vibração 2,8 / 4,5 mm/s, 3 leituras) |

## O que foi feito

| Hora | Etapa |
|---|---|
| 10:55:04 | Coletor ligado (boot 40), motor parado. |
| 11:02:11 | Motor ligado. |
| 11:04 | Corrente conferida com o alicate (1ª vez). |
| ~11:07 | Cabo do acelerômetro afastado dos cabos de alimentação do motor. |
| 13:12:21 | Leitura do CT3 cai (garra do transformador deslocada). |
| 13:22 | Corrente conferida com o alicate (2ª vez). |
| 13:24:23 | Garra do CT3 reposicionada. |
| 13:27:31 | Motor desligado, após 2 h 25 min 20 s. |
| 13:29:17 | Última leitura exportada. |

## Resultados

**Envio (boot 40, 10:55:04 a 13:29:17)**

- 4.597 leituras, sequência contígua de 1 a 4597, nenhuma perdida, fila sempre vazia.
- Intervalo médio entre leituras: 2,013 s; quatro intervalos acima de 5 s, o maior de 14,4 s.
- Atraso aquisição → banco: P50 0,2 s, P95 2,2 s, P99 2,2 s, máximo 23,0 s.

**Vibração (maior eixo, velocidade RMS)**

| Período | Leituras | Mediana | P95 | Acima de 4,5 mm/s | Inválidas (> 100 mm/s) |
|---|---|---|---|---|---|
| Motor parado (10:56 a 11:02) | 180 | 0,40 | — | — | — |
| Ligado, cabo junto à alimentação (11:02:11 a 11:07) | 145 | 14,6 | 71,4 | 137 | 44 |
| Ligado, cabo afastado (11:07:19 a 13:27:29) | 4.176 | 1,15 | 1,34 | 4 | 1 |

Os picos eram **interferência elétrica no cabo do acelerômetro**, não vibração: sumiram quando o
cabo foi afastado. Restaram quatro leituras isoladas em 2 h 20 min (5,9 mm/s às 12:16:34, 8,0 mm/s às
13:08:58, 243 mm/s às 13:14:33, gravada como inválida, e 47,5 mm/s às 13:27:29, no desligamento),
nunca três seguidas. Mediana e P95 consideram só as leituras válidas.
Consequência: a mediana de 4,40 mm/s e o alerta crítico da demonstração de 17/11 foram artefato
dessa interferência.

**Corrente**

- Motor ligado, três fases (11:07 a 13:12): médias de 1,45 / 1,44 / 1,45 A, 71 % da nominal.
- Contra o alicate: +6 % a +8 % às 11:04; +12 %, +4 % e −32 % às 13:22 (a terceira com a garra
  deslocada). Depois de reposicionada, o CT3 ficou a −4 % do alicate.
- Leituras do CT3 e da média de corrente de **13:12:21 a 13:24:23 são inválidas**.
- A correspondência entre as fases medidas com o alicate e CT1/CT2/CT3 não foi confirmada.

**Temperatura:** de 21,3 °C a 29,7 °C ao longo da sessão.

## O que esta sessão permite afirmar

- O coletor envia a cada 2 s por mais de 2 h 30 min sem perder leitura, e a plataforma recebe com
  atraso típico abaixo de 3 s.
- A corrente medida fica dentro de cerca de 10 % de um alicate true-RMS, sem ajuste de calibração,
  desde que a garra esteja bem assentada.
- A vibração medida é sensível à passagem do cabo; com o cabo afastado, fica estável em torno de
  1,1 mm/s com o motor ligado.

## O que continua fora

Um único motor, sem carga, uma única sessão; vibração sem medidor de referência; nenhuma anomalia
provocada, portanto nenhuma métrica de detecção (falsos alarmes, sensibilidade, atraso de
detecção). A plataforma não abriu alerta nesta sessão: o alerta crítico de 17/11 continuava ativo
e a regra não abre outro enquanto houver um ativo para o mesmo motor. Sem ele, os cinco minutos de
interferência teriam aberto um (81 janelas de três leituras válidas seguidas acima de 4,5 mm/s).
