"""Demonstração funcional de 17/11/2026 (motor de bancada M-01, coletor Eixo).

Lê leituras_M-01.csv (exportado da tabela leituras), imprime os números citados no
Documento de Software e no Artigo e gera figura_demonstracao.png.

Uso:  python analise.py
Requer: Python 3 e matplotlib.
"""
import csv
import json
import statistics as st
from datetime import datetime
from pathlib import Path

AQUI = Path(__file__).parent
LIM_VIB_ATENCAO, LIM_VIB_CRITICO = 2.8, 4.5      # mm/s (regra padrão do cadastro)
LIM_CORR_ATENCAO, LIM_CORR_CRITICO = 2.142, 2.346  # A (1,05 e 1,15 x 2,04 A)
K = 3                                             # persistência da regra
ALERTA_CRIADO = '2026-11-17T21:24:03.439Z'        # alertas.criado_em (ver alerta.json)


def ts(s):
    return datetime.strptime(s, '%Y-%m-%dT%H:%M:%S.%fZ')


def pct(v, p):
    """Percentil com interpolação linear (igual ao percentile_cont do PostgreSQL)."""
    v = sorted(v)
    k = (len(v) - 1) * p
    i = int(k)
    return v[i] + (v[min(i + 1, len(v) - 1)] - v[i]) * (k - i)


def ler():
    rows = []
    with open(AQUI / 'leituras_M-01.csv', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            rows.append({
                'ts': ts(r['ts_utc']), 'rec': ts(r['recebido_em_utc']), 'seq': int(r['seq']),
                'temp': float(r['temp_c']), 'corr': float(r['corr_a']), 'vib': float(r['vib_mm_s']),
                'valida': r['valida'] == '1',
                'ct': [float(r['corr_ct%d_a' % i]) for i in (1, 2, 3)],
                'eixos': [float(r['vib_%s_mm_s' % e]) for e in 'xyz'],
            })
    t0 = rows[0]['ts']
    for r in rows:
        r['t'] = (r['ts'] - t0).total_seconds()
        r['atraso'] = (r['rec'] - r['ts']).total_seconds()
        r['ligado'] = min(r['ct']) > 0.5          # corrente nas três fases
    return rows


def resumo(rows):
    lig = [r for r in rows if r['ligado']]
    par = [r for r in rows if not r['ligado']]
    lig_ok = [r['vib'] for r in lig if r['valida']]
    par_ok = [r['vib'] for r in par if r['valida']]
    atr = [r['atraso'] for r in rows]
    seqs = [r['seq'] for r in rows]
    # primeira ocorrência de K leituras válidas seguidas >= limite crítico de vibração
    validas = [r for r in rows if r['valida']]
    primeira = next((validas[i + K - 1] for i in range(len(validas) - K + 1)
                     if all(x['vib'] >= LIM_VIB_CRITICO for x in validas[i:i + K])), None)
    return {
        'leituras': len(rows),
        'inicio_utc': rows[0]['ts'].isoformat(), 'fim_utc': rows[-1]['ts'].isoformat(),
        'duracao_s': round(rows[-1]['t'], 1),
        'intervalo_medio_s': round(rows[-1]['t'] / (len(rows) - 1), 3),
        'seq_min': min(seqs), 'seq_max': max(seqs),
        'pct_recebidas': round(100 * len(rows) / (max(seqs) - min(seqs) + 1), 2),
        'invalidas': sum(not r['valida'] for r in rows),
        'invalidas_vib': sorted(r['vib'] for r in rows if not r['valida']),
        'atraso_p50_s': round(pct(atr, 0.5), 2), 'atraso_p95_s': round(pct(atr, 0.95), 2),
        'atraso_max_s': round(max(atr), 2),
        'temp_min': min(r['temp'] for r in rows), 'temp_max': max(r['temp'] for r in rows),
        'parado': {
            'n': len(par), 'corr_max_a': max(r['corr'] for r in par if max(r['ct']) < 0.5),
            'uma_fase': [(round(r['t'], 1), r['ct']) for r in par if max(r['ct']) >= 0.5],
            'vib_mediana': round(st.median(par_ok), 2), 'vib_p95': round(pct(par_ok, 0.95), 2),
            'vib_max_valida': max(par_ok),
        },
        'ligado': {
            'n': len(lig), 't_ini_s': round(lig[0]['t'], 1), 't_fim_s': round(lig[-1]['t'], 1),
            'duracao_s': round(lig[-1]['t'] - lig[0]['t'], 1),
            'corr_media_a': round(st.mean(r['corr'] for r in lig), 3),
            'corr_min_a': min(r['corr'] for r in lig), 'corr_max_a': max(r['corr'] for r in lig),
            'corr_fases_media_a': [round(st.mean(r['ct'][i] for r in lig), 3) for i in range(3)],
            'pct_corrente_nominal': round(100 * st.mean(r['corr'] for r in lig) / 2.04, 1),
            'vib_validas': len(lig_ok), 'vib_mediana': round(st.median(lig_ok), 2),
            'vib_p25': round(pct(lig_ok, 0.25), 2), 'vib_p75': round(pct(lig_ok, 0.75), 2),
            'vib_min': min(lig_ok), 'vib_max_valida': max(lig_ok),
            'vib_ge_critico': sum(v >= LIM_VIB_CRITICO for v in lig_ok),
            'vib_ge_atencao': sum(v >= LIM_VIB_ATENCAO for v in lig_ok),
            'vib_gt_20': sum(v > 20 for v in lig_ok),
            'eixo_maior': [sum(1 for r in lig if r['valida'] and r['eixos'].index(max(r['eixos'])) == i) for i in range(3)],
        },
        'regra': {
            'terceira_leitura_utc': primeira['ts'].isoformat() if primeira else None,
            'terceira_leitura_t_s': round(primeira['t'], 1) if primeira else None,
            'valores': [x['vib'] for x in validas[validas.index(primeira) - K + 1: validas.index(primeira) + 1]] if primeira else None,
            'alerta_criado_utc': ALERTA_CRIADO,
            'aquisicao_ate_alerta_s': round((ts(ALERTA_CRIADO) - primeira['ts']).total_seconds(), 2) if primeira else None,
            'partida_ate_alerta_s': round((ts(ALERTA_CRIADO) - lig[0]['ts']).total_seconds(), 1) if primeira else None,
        },
    }


def figura(rows, res):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    plt.rcParams.update({'font.size': 7, 'font.family': 'DejaVu Sans', 'axes.linewidth': 0.6,
                         'xtick.major.width': 0.6, 'ytick.major.width': 0.6})
    t = [r['t'] for r in rows]
    t_alerta = (ts(ALERTA_CRIADO) - rows[0]['ts']).total_seconds()
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(3.5, 3.5), sharex=True,
                                 gridspec_kw={'height_ratios': [1, 1.35], 'hspace': 0.12})

    for i, (cor, est) in enumerate((('#1f77b4', '-'), ('#ff7f0e', '--'), ('#2ca02c', ':'))):
        a1.plot(t, [r['ct'][i] for r in rows], est, color=cor, lw=0.9, label='Fase %d' % (i + 1))
    a1.axhline(LIM_CORR_CRITICO, color='#b00020', ls='--', lw=0.7)
    a1.text(4, LIM_CORR_CRITICO + 0.06, 'limite crítico 2,35 A', color='#b00020', fontsize=6)
    a1.set_ylabel('Corrente (A RMS)')
    a1.set_ylim(-0.1, 2.9)
    a1.legend(loc='center left', frameon=False, fontsize=6, handlelength=2.2)
    a1.set_title('(a) Corrente por fase', loc='left', fontsize=7, pad=2)

    ok = [(r['t'], r['vib']) for r in rows if r['valida']]
    inv = [(r['t'], r['vib']) for r in rows if not r['valida']]
    a2.plot([x for x, _ in ok], [y for _, y in ok], '-', color='#444444', lw=0.8, marker='o', ms=1.4,
            label='Leitura válida')
    a2.plot([x for x, _ in inv], [y for _, y in inv], 'x', color='#b00020', ms=4, mew=0.9,
            label='Fora de faixa (inválida)')
    a2.axhline(LIM_VIB_CRITICO, color='#b00020', ls='--', lw=0.7)
    a2.text(4, LIM_VIB_CRITICO * 1.18, 'limite crítico 4,5 mm/s', color='#b00020', fontsize=6)
    a2.axhline(100, color='#888888', ls=':', lw=0.6)
    a2.text(4, 112, 'faixa válida até 100 mm/s', color='#555555', fontsize=6)
    a2.axvline(t_alerta, color='#000000', ls='-.', lw=0.8, label='Alerta crítico (18:24:03)')
    a2.set_yscale('log')
    a2.set_ylim(0.15, 400)
    a2.set_yticks([0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200])
    a2.set_yticklabels(['0,2', '0,5', '1', '2', '5', '10', '20', '50', '100', '200'])
    a2.set_ylabel('Velocidade de vibração\n(mm/s RMS, escala log)')
    a2.set_xlabel('Tempo desde a primeira leitura (s) — início às 18:18:55 (UTC−3)')
    a2.legend(loc='center left', bbox_to_anchor=(0.0, 0.66), frameon=False, fontsize=6, handlelength=2.2)
    a2.set_title('(b) Vibração (maior eixo, 10–250 Hz)', loc='left', fontsize=7, pad=2)
    a2.set_xlim(0, rows[-1]['t'])
    for ax in (a1, a2):
        ax.grid(True, which='major', lw=0.3, color='#dddddd')
        ax.axvspan(res['ligado']['t_ini_s'], res['ligado']['t_fim_s'], color='#f2f2f2', zorder=0)
    fig.savefig(AQUI / 'figura_demonstracao.png', dpi=400, bbox_inches='tight', pad_inches=0.03)


if __name__ == '__main__':
    linhas = ler()
    r = resumo(linhas)
    (AQUI / 'resumo.json').write_text(json.dumps(r, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(r, indent=2, ensure_ascii=False))
    figura(linhas, r)
