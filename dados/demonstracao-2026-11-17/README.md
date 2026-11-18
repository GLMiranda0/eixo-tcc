# Demonstração funcional — motor de bancada M-01 (17/11/2026)

Dados da única sessão de bancada relatada no Documento de Software (Seção 10.1) e no Artigo.
É uma **demonstração de funcionamento de ponta a ponta**, não a execução do protocolo experimental:
os sensores não foram calibrados, a fixação do acelerômetro não foi caracterizada e não há rótulos
de referência. Nenhum desempenho diagnóstico pode ser calculado a partir destes dados.

| Item | Valor |
|---|---|
| Motor | WEG, carcaça 71, 0,37 kW (0,50 cv), 220 V, 2,04 A, 1680 rpm — cadastrado como M-01 |
| Coletor | Coletor Eixo (ESP32), `device_id` coletor-6ce7b0, firmware 1.1.1 (commit 6323a75 do Coletor-eixo), boot 35 |
| Plataforma | https://eixomotores.cloud — banco no esquema da migração 005 |
| Sessão | 21:18:55 a 21:28:03 UTC (18:18:55 a 18:28:03, UTC−3); 9 min 8 s |
| Intervalo de envio | 10 s (padrão); ciclo de aquisição de 2 s |

## Arquivos

- `leituras_M-01.csv` — as 274 leituras da tabela `leituras`, em ordem de aquisição: instante de
  aquisição (`ts_utc`) e de recepção (`recebido_em_utc`), identificação do pacote (`device_id`,
  `boot`, `seq`), temperatura, corrente (média das fases), vibração (maior eixo), `valida`
  (0 = fora da faixa física, excluída das regras), corrente por fase, vibração por eixo, versão do
  firmware e contador de descartes da fila.
- `alerta.json` — o alerta aberto pela regra de limite fixo, a anomalia com a cópia da regra e das
  três leituras que a dispararam, o cadastro do motor, as regras vigentes, a linha da view
  `qualidade_telemetria` e as ações corretivas sugeridas.
- `analise.py` — recalcula os números citados nos documentos (`resumo.json`) e gera
  `figura_demonstracao.png`. Uso: `python analise.py` (Python 3 e matplotlib).
- `telas/` — capturas da plataforma após a sessão: painel, página do motor (corrente e vibração) e
  alerta com as ações corretivas.

## Resumo dos números

- 274 leituras, sequência contígua de 1 a 274: 100 % das esperadas, nenhum descarte na fila.
- Intervalo médio entre leituras: 2,006 s.
- Atraso aquisição → banco: P50 4,6 s, P95 10,2 s, máximo 11,3 s.
- 9 leituras de vibração acima de 100 mm/s (107 a 249 mm/s) gravadas como inválidas.
- Motor em funcionamento por 156 s: corrente média 1,44 A (70 % da nominal), equilibrada entre as fases.
- Vibração: mediana 0,38 mm/s com o motor parado e 4,40 mm/s em funcionamento (71 leituras válidas,
  com picos isolados de até 82 mm/s).
- Um alerta crítico de vibração às 21:24:03 UTC, 44 s após a partida, depois de três leituras válidas
  seguidas acima de 4,5 mm/s (8,17, 6,10 e 6,77 mm/s). O mesmo instante é obtido aplicando a regra
  ao CSV, fora da plataforma.
