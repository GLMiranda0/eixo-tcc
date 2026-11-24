"""Sessão de bancada de 24/11/2026 (motor M-01, coletor Eixo, boot 40).

Lê leituras_M-01_2026-11-24.csv (exportado da tabela leituras) e calibracao_corrente.csv,
grava resumo.json com os números citados no Documento de Software e no Artigo e gera
figura_sessao.png e figura_sessao_en.png (rótulos em inglês).

Uso:  python analise.py
Requer: Python 3 e matplotlib.
"""
import csv
import json
import statistics as st
from datetime import datetime, timedelta
from pathlib import Path

AQUI = Path(__file__).parent
BOOT = 40                                   # inicialização do coletor que corresponde à sessão
LIM_VIB_ATENCAO, LIM_VIB_CRITICO = 2.8, 4.5  # mm/s (regra padrão do cadastro)
LIM_CORR_CRITICO = 2.346                    # A (1,15 x 2,04 A)
K = 3                                       # persistência da regra
I_NOMINAL = 2.04
# Intervenções anotadas em eventos.csv (hora de Brasília, UTC-3)
CABO_AFASTADO = '11:07:19'                  # primeira leitura acompanhada após afastar o cabo
CT3_QUEDA, CT3_CORRIGIDO = '13:12:21', '13:24:23'   # apurados nesta série (ver ct3_fora)


def ts(s):
    return datetime.strptime(s, '%Y-%m-%dT%H:%M:%S.%fZ')


def hora(d):
    return (d - timedelta(hours=3)).strftime('%H:%M:%S')


def pct(v, p):
    """Percentil com interpolação linear (igual ao percentile_cont do PostgreSQL)."""
    v = sorted(v)
    k = (len(v) - 1) * p
    i = int(k)
    return v[i] + (v[min(i + 1, len(v) - 1)] - v[i]) * (k - i)


def ler():
    rows = []
    with open(AQUI / 'leituras_M-01_2026-11-24.csv', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if int(r['boot']) != BOOT:
                continue
            rows.append({
                'ts': ts(r['ts_utc']), 'rec': ts(r['recebido_em_utc']), 'seq': int(r['seq']),
                'temp': float(r['temp_c']), 'corr': float(r['corr_a']), 'vib': float(r['vib_mm_s']),
                'valida': r['valida'] == '1', 'perdidas': int(r['perdidas']),
                'ct': [float(r['corr_ct%d_a' % i]) for i in (1, 2, 3)],
                'eixos': [float(r['vib_%s_mm_s' % e]) for e in 'xyz'],
            })
    t0 = rows[0]['ts']
    for r in rows:
        r['t'] = (r['ts'] - t0).total_seconds()
        r['h'] = hora(r['ts'])
        r['atraso'] = (r['rec'] - r['ts']).total_seconds()
        r['ligado'] = r['ct'][0] > 0.5 and r['ct'][1] > 0.5   # CT3 não entra: garra deslocada
    return rows


def sessao_ligada(rows):
    """Maior trecho contínuo com o motor ligado (ignora o transitório de energização)."""
    melhor, ini = (0, 0), None
    for i, r in enumerate(rows + [{'ligado': False}]):
        if r['ligado'] and ini is None:
            ini = i
        elif not r['ligado'] and ini is not None:
            if i - ini > melhor[1] - melhor[0]:
                melhor = (ini, i)
            ini = None
    return melhor


def vib_stats(sel):
    ok = [r['vib'] for r in sel if r['valida']]
    todas = [r['vib'] for r in sel]
    validas = [r for r in sel if r['valida']]
    seguidas = sum(1 for i in range(len(validas) - K + 1)
                   if all(x['vib'] >= LIM_VIB_CRITICO for x in validas[i:i + K]))
    return {
        'n': len(sel), 'invalidas': sum(not r['valida'] for r in sel),
        'mediana': round(st.median(ok), 2), 'p95': round(pct(ok, 0.95), 2),
        'max_valida': max(ok), 'max': max(todas),
        'ge_atencao': sum(v >= LIM_VIB_ATENCAO for v in todas),
        'ge_critico': sum(v >= LIM_VIB_CRITICO for v in todas),
        'janelas_k_seguidas_ge_critico': seguidas,
    }


def calibracao():
    out = []
    with open(AQUI / 'calibracao_corrente.csv', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r['alicate_A']:
                a, c = float(r['alicate_A']), float(r['coletor_A'])
                out.append({'hora': r['hora_brasilia'], 'fase': int(r['fase']), 'alicate_a': a,
                            'coletor_a': c, 'erro_pct': round(100 * (c - a) / a, 1)})
    return out


def resumo(rows):
    i0, i1 = sessao_ligada(rows)
    lig = rows[i0:i1]
    antes = [r for r in lig if r['h'] < '11:07:00']
    depois = [r for r in lig if r['h'] >= CABO_AFASTADO]
    par_ini = [r for r in rows[:i0] if '10:56:00' <= r['h']]
    par_fim = rows[i1:]
    ct_ok = [r for r in depois if r['h'] < CT3_QUEDA]
    ct3_fora = [r for r in lig if r['ct'][2] < 0.9 * r['ct'][0]]
    atr = [r['atraso'] for r in rows]
    dts = [rows[i + 1]['t'] - rows[i]['t'] for i in range(len(rows) - 1)]
    seqs = [r['seq'] for r in rows]
    return {
        'boot': BOOT, 'leituras': len(rows),
        'inicio': rows[0]['h'], 'fim': rows[-1]['h'], 'duracao_s': round(rows[-1]['t'], 1),
        'seq_min': min(seqs), 'seq_max': max(seqs),
        'sequencia_contigua': seqs == list(range(min(seqs), max(seqs) + 1)),
        'pct_recebidas': round(100 * len(rows) / (max(seqs) - min(seqs) + 1), 2),
        'perdidas_fila_max': max(r['perdidas'] for r in rows),
        'intervalo_medio_s': round(rows[-1]['t'] / (len(rows) - 1), 3),
        'intervalos_gt_5s': sum(d > 5 for d in dts), 'intervalo_max_s': round(max(dts), 1),
        'atraso_p50_s': round(pct(atr, 0.5), 2), 'atraso_p95_s': round(pct(atr, 0.95), 2),
        'atraso_p99_s': round(pct(atr, 0.99), 2), 'atraso_max_s': round(max(atr), 2),
        'atraso_gt_5s': sum(a > 5 for a in atr),
        'invalidas': sum(not r['valida'] for r in rows),
        'temp_inicio': rows[0]['temp'], 'temp_fim': rows[-1]['temp'],
        'temp_max': max(r['temp'] for r in rows),
        'motor_ligado': {'inicio': lig[0]['h'], 'fim': lig[-1]['h'], 'n': len(lig),
                         'duracao_s': round(lig[-1]['t'] - lig[0]['t'], 1)},
        'vib_parado_inicio': vib_stats(par_ini),
        'vib_parado_fim': vib_stats(par_fim) if len(par_fim) > 5 else None,
        'vib_ligado_cabo_junto': vib_stats(antes),
        'vib_ligado_cabo_afastado': vib_stats(depois),
        'vib_cabo_afastado_acima_atencao': [(r['h'], r['vib'], r['valida']) for r in depois
                                            if r['vib'] >= LIM_VIB_ATENCAO],
        'corrente_fases_media_a': [round(st.mean(r['ct'][i] for r in ct_ok), 3) for i in range(3)],
        'corrente_fases_min_a': [min(r['ct'][i] for r in ct_ok) for i in range(3)],
        'corrente_fases_max_a': [max(r['ct'][i] for r in ct_ok) for i in range(3)],
        'pct_corrente_nominal': round(100 * st.mean(st.mean(r['ct']) for r in ct_ok) / I_NOMINAL, 1),
        'ct3_fora': {'inicio': ct3_fora[0]['h'], 'fim': ct3_fora[-1]['h'], 'n': len(ct3_fora)}
                    if ct3_fora else None,
        'calibracao_alicate': calibracao(),
    }


ROTULOS = {
    'pt': {'fase': 'Fase %d', 'limc': 'limite crítico 2,35 A', 'garra': 'garra da fase 3\ndeslocada',
           'corr': 'Corrente (A RMS)', 'ta': '(a) Corrente por fase', 'ok': 'Leitura válida',
           'inv': 'Fora de faixa (inválida)', 'limv': 'limite crítico 4,5 mm/s',
           'cabo': 'Cabo do acelerômetro afastado', 'vib': 'Velocidade de vibração\n(mm/s RMS, escala log)',
           'x': 'Tempo desde a primeira leitura (min) — início às %s (UTC−3)',
           'tb': '(b) Vibração (maior eixo, 10–250 Hz)', 'dec': ',', 'arq': 'figura_sessao.png'},
    'en': {'fase': 'Phase %d', 'limc': 'critical threshold 2.35 A', 'garra': 'phase-3 clamp\nshifted',
           'corr': 'Current (A RMS)', 'ta': '(a) Current per phase', 'ok': 'Valid reading',
           'inv': 'Out of range (invalid)', 'limv': 'critical threshold 4.5 mm/s',
           'cabo': 'Accelerometer cable moved away', 'vib': 'Vibration velocity\n(mm/s RMS, log scale)',
           'x': 'Time since first reading (min) — start at %s (UTC−3)',
           'tb': '(b) Vibration (largest axis, 10–250 Hz)', 'dec': '.', 'arq': 'figura_sessao_en.png'},
}


def figura(rows, res, idioma='pt'):
    L = ROTULOS[idioma]
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    plt.rcParams.update({'font.size': 7, 'font.family': 'DejaVu Sans', 'axes.linewidth': 0.6,
                         'xtick.major.width': 0.6, 'ytick.major.width': 0.6})
    m = lambda r: r['t'] / 60
    por_hora = {r['h']: m(r) for r in rows}
    x_lig0, x_lig1 = por_hora[res['motor_ligado']['inicio']], por_hora[res['motor_ligado']['fim']]
    x_cabo = min(m(r) for r in rows if r['h'] >= CABO_AFASTADO)
    x_q = min(m(r) for r in rows if r['h'] >= CT3_QUEDA)
    x_c = min(m(r) for r in rows if r['h'] >= CT3_CORRIGIDO)

    fig, (a1, a2) = plt.subplots(2, 1, figsize=(3.5, 3.6), sharex=True,
                                 gridspec_kw={'height_ratios': [1, 1.35], 'hspace': 0.12})
    t = [m(r) for r in rows]
    for i, (cor, est) in enumerate((('#1f77b4', '-'), ('#ff7f0e', '--'), ('#2ca02c', '-'))):
        a1.plot(t, [r['ct'][i] for r in rows], est, color=cor, lw=0.6, label=L['fase'] % (i + 1))
    a1.axhline(LIM_CORR_CRITICO, color='#b00020', ls='--', lw=0.7)
    a1.text(22, LIM_CORR_CRITICO + 0.07, L['limc'], color='#b00020', fontsize=6)
    a1.axvspan(x_q, x_c, color='#ffe2b8', zorder=1, lw=0)
    a1.annotate(L['garra'], xy=((x_q + x_c) / 2, 0.85), xytext=(100, 0.5),
                fontsize=6, ha='center', arrowprops={'arrowstyle': '-', 'lw': 0.5})
    a1.set_ylabel(L['corr'])
    a1.set_ylim(-0.1, 3.5)
    a1.legend(loc='upper right', frameon=False, fontsize=6,
              handlelength=2.0, ncol=3, columnspacing=1.0)
    a1.set_title(L['ta'], loc='left', fontsize=7, pad=2)

    ok = [(m(r), r['vib']) for r in rows if r['valida']]
    inv = [(m(r), r['vib']) for r in rows if not r['valida']]
    a2.plot([x for x, _ in ok], [y for _, y in ok], '-', color='#444444', lw=0.5,
            label=L['ok'])
    a2.plot([x for x, _ in inv], [y for _, y in inv], 'x', color='#b00020', ms=3, mew=0.7,
            label=L['inv'])
    a2.axhline(LIM_VIB_CRITICO, color='#b00020', ls='--', lw=0.7)
    a2.text(60, LIM_VIB_CRITICO * 1.2, L['limv'], color='#b00020', fontsize=6)
    a2.axvline(x_cabo, color='#000000', ls='-.', lw=0.8, label=L['cabo'])
    a2.set_yscale('log')
    a2.set_ylim(0.15, 600)
    a2.set_yticks([0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200])
    a2.set_yticklabels([t.replace(',', L['dec']) for t in ['0,2', '0,5', '1', '2', '5', '10', '20', '50', '100', '200']])
    a2.set_ylabel(L['vib'])
    a2.set_xlabel(L['x'] % res['inicio'])
    a2.legend(loc='upper right', frameon=False, fontsize=6, handlelength=2.0)
    a2.set_title(L['tb'], loc='left', fontsize=7, pad=2)
    a2.set_xlim(0, t[-1])
    for ax in (a1, a2):
        ax.grid(True, which='major', lw=0.3, color='#dddddd')
        ax.axvspan(x_lig0, x_lig1, color='#f2f2f2', zorder=0, lw=0)
    fig.savefig(AQUI / L['arq'], dpi=400, bbox_inches='tight', pad_inches=0.03)


if __name__ == '__main__':
    linhas = ler()
    r = resumo(linhas)
    (AQUI / 'resumo.json').write_text(json.dumps(r, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(r, indent=2, ensure_ascii=False))
    figura(linhas, r)
    figura(linhas, r, 'en')   # rótulos em inglês, para o manuscrito da IEEE LAT
