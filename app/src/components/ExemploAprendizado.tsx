import { useState } from 'react'
import { GRANDEZAS } from '../lib/types'

/**
 * Exemplo do que a plataforma reconhece quando já tem 14 dias de histórico:
 * o mesmo motor, uma terça-feira, com a linha de base aprendida por hora do dia.
 * Os dados são sintéticos e determinísticos (sem aleatoriedade entre renderizações).
 */

type Cenario = 'normal' | 'rolamento' | 'sobrecarga'

const CENARIOS: { id: Cenario; nome: string; desc: string }[] = [
  { id: 'normal', nome: 'Dia normal', desc: 'O motor segue o normal aprendido' },
  { id: 'rolamento', nome: 'Desvio sutil', desc: 'A vibração sobe devagar, abaixo do limite fixo' },
  { id: 'sobrecarga', nome: 'Sobrecarga', desc: 'Corrente e vibração sobem juntas' },
]

const HORAS = Array.from({ length: 24 }, (_, h) => h)
const LIMITE = 4.5

// ruído determinístico em [-1, 1]
const ruido = (h: number, k: number) => {
  const v = Math.sin(h * 12.9898 + k * 78.233) * 43758.5453
  return (v - Math.floor(v)) * 2 - 1
}
// perfil do turno: carga maior das 6h às 22h, pico às 14h
const perfil = (h: number) => (h < 6 || h > 22 ? 0 : Math.max(0, Math.sin(((h - 6) / 16) * Math.PI)))
const media = (h: number) => 1.9 + 0.5 * perfil(h)
const sigma = (h: number) => 0.2 + 0.06 * perfil(h)

function real(c: Cenario, h: number) {
  const base = media(h) + ruido(h, 1) * sigma(h) * 0.8
  if (c === 'rolamento') return base + (h >= 12 ? Math.min(1.4, (h - 12) * 0.35) : 0)
  if (c === 'sobrecarga') return base + (h >= 14 && h <= 17 ? 2.9 : 0)
  return base
}
function corrente(c: Cenario, h: number) {
  // em % da corrente nominal
  const base = 70 + 25 * perfil(h) + ruido(h, 2) * 2
  if (c === 'sobrecarga') return base + (h >= 14 && h <= 17 ? 24 : 0)
  return base
}

const f1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const f0 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

export function ExemploAprendizado({ persistencia = 3 }: { persistencia?: number }) {
  const [cenario, setCenario] = useState<Cenario>('rolamento')
  const [hora, setHora] = useState(15)

  const v = real(cenario, hora)
  const m = media(hora)
  const s = sigma(hora)
  const z = (v - m) / s
  const corr = corrente(cenario, hora)
  const corrNormal = 70 + 25 * perfil(hora)
  const corrDesvio = corr - corrNormal

  // fase 1: leituras seguidas acima do limite (uma hora = muitas leituras; aqui o "seguidas" é por hora)
  const acima = v >= LIMITE
  const horasAcima = HORAS.filter((h) => h <= hora && real(cenario, h) >= LIMITE).length
  const fase1 = !acima
    ? { nivel: 'ok' as const, titulo: 'Fase 1 · sem alerta', texto: `${f1(v)} mm/s fica abaixo do limite fixo de ${f1(LIMITE)} mm/s. Só com os limites fixos, ${cenario === 'rolamento' ? 'este desvio passaria despercebido' : 'nada é apontado'}.` }
    : horasAcima >= persistencia
      ? { nivel: 'crit' as const, titulo: 'Fase 1 · alerta crítico aberto', texto: `${f1(v)} mm/s passa do limite fixo de ${f1(LIMITE)} mm/s pela ${horasAcima}ª leitura seguida: com ${persistencia} seguidas o alerta crítico é aberto.` }
      : { nivel: 'warn' as const, titulo: 'Fase 1 · acumulando', texto: `${f1(v)} mm/s passa do limite fixo de ${f1(LIMITE)} mm/s (${horasAcima} de ${persistencia} leituras seguidas). Um pico isolado não abre alerta; na ${persistencia}ª seguida, abre.` }

  const fora = Math.abs(z) > 2
  const fase2 = fora
    ? { nivel: 'warn' as const, titulo: 'Fase 2 · desvio do normal aprendido', texto: `Para terça-feira às ${hora}h o normal aprendido é ${f1(m)} ± ${f1(2 * s)} mm/s. A leitura de ${f1(v)} mm/s está a ${z > 0 ? '+' : ''}${f1(z)}σ: fora do envelope${acima ? ', e o desvio é confirmado pela linha de base' : ', alerta de atenção mesmo abaixo do limite fixo'}.` }
    : { nivel: 'ok' as const, titulo: 'Fase 2 · dentro do normal', texto: `Para terça-feira às ${hora}h o normal aprendido é ${f1(m)} ± ${f1(2 * s)} mm/s. A leitura de ${f1(v)} mm/s está a ${z > 0 ? '+' : ''}${f1(z)}σ: dentro do envelope.` }

  const fase3 =
    cenario === 'sobrecarga' && fora && corrDesvio > 10
      ? { nivel: 'crit' as const, titulo: 'Fase 3 · padrão: sobrecarga mecânica', texto: `Corrente ${f0(corrDesvio)} % acima do normal e vibração subindo junto. Ação sugerida: verificar a carga acoplada (bomba, correia, acoplamento) e reduzir a carga.` }
      : cenario === 'rolamento' && fora
        ? { nivel: 'warn' as const, titulo: 'Fase 3 · padrão: desgaste de rolamento', texto: `Vibração sobe sozinha, com corrente (${f0(corr)} % In) e temperatura no normal. Ação sugerida: ouvir o mancal, verificar lubrificação e programar a troca do rolamento.` }
        : { nivel: 'info' as const, titulo: 'Fase 3 · nenhum padrão', texto: 'Sem desvio combinado, não há padrão a nomear.' }

  // gráfico
  const W = 800
  const H = 220
  const P = { l: 46, r: 16, t: 14, b: 26 }
  const lo = 1
  const hi = 5.5
  const x = (h: number) => P.l + (h / 23) * (W - P.l - P.r)
  const y = (val: number) => P.t + (1 - (Math.min(hi, Math.max(lo, val)) - lo) / (hi - lo)) * (H - P.t - P.b)
  const cima = HORAS.map((h) => `${x(h).toFixed(1)} ${y(media(h) + 2 * sigma(h)).toFixed(1)}`)
  const baixo = [...HORAS].reverse().map((h) => `${x(h).toFixed(1)} ${y(media(h) - 2 * sigma(h)).toFixed(1)}`)
  const linhaMedia = HORAS.map((h, i) => (i === 0 ? 'M' : 'L') + `${x(h).toFixed(1)} ${y(media(h)).toFixed(1)}`).join(' ')
  const linhaReal = HORAS.map((h, i) => (i === 0 ? 'M' : 'L') + `${x(h).toFixed(1)} ${y(real(cenario, h)).toFixed(1)}`).join(' ')
  const grid = [1, 2, 3, 4, 5]

  return (
    <div className="exemplo-aprendizado">
      <div className="card-h">
        <div>
          <p className="eyebrow">Exemplo · o mesmo motor com 14 dias de histórico</p>
          <b>O que a plataforma reconhece em uma terça-feira</b>
        </div>
        <div className="seg" role="tablist" aria-label="Cenário do exemplo">
          {CENARIOS.map((c) => (
            <button key={c.id} role="tab" aria-selected={cenario === c.id} className={cenario === c.id ? 'on' : ''} onClick={() => setCenario(c.id)} title={c.desc}>
              {c.nome}
            </button>
          ))}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '4px 0 8px' }}>
        {CENARIOS.find((c) => c.id === cenario)?.desc}. A faixa azul é o <b>normal aprendido</b> (média ± 2σ por hora do dia); a linha tracejada vermelha é o <b>limite fixo</b> da fase 1. Mova a hora para ver a leitura
        comparada ao normal daquele horário.
      </p>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vibração ao longo do dia comparada ao normal aprendido">
        {grid.map((g) => (
          <g key={g}>
            <line className="gl" x1={P.l} x2={W - P.r} y1={y(g)} y2={y(g)} />
            <text x={P.l - 8} y={y(g) + 4} textAnchor="end">
              {f1(g)}
            </text>
          </g>
        ))}
        <polygon className="rib" points={[...cima, ...baixo].join(' ')} fill="var(--accent)" />
        <path d={linhaMedia} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="5 4" />
        <line className="lim" x1={P.l} x2={W - P.r} y1={y(LIMITE)} y2={y(LIMITE)} />
        <text x={P.l + 6} y={y(LIMITE) - 5} style={{ fill: 'var(--crit)' }}>
          limite fixo {f1(LIMITE)}
        </text>
        <text x={P.l + 6} y={y(media(14) + 2 * sigma(14)) - 6} style={{ fill: 'var(--accent)' }}>
          normal aprendido ± 2σ
        </text>
        <path className="ln" d={linhaReal} stroke={GRANDEZAS.vib.cor} />
        {[0, 6, 12, 18, 23].map((h) => (
          <text key={h} x={x(h)} y={H - 8} textAnchor={h === 0 ? 'start' : h === 23 ? 'end' : 'middle'}>
            {h}h
          </text>
        ))}
        <line x1={x(hora)} x2={x(hora)} y1={P.t} y2={H - P.b} stroke="var(--fg)" strokeWidth="1" strokeDasharray="2 3" opacity=".6" />
        <circle cx={x(hora)} cy={y(v)} r="5" fill={GRANDEZAS.vib.cor} stroke="var(--surface)" strokeWidth="2" />
        <text x={x(hora) + (hora > 18 ? -10 : 10)} y={y(v) - 10} textAnchor={hora > 18 ? 'end' : 'start'} style={{ fill: 'var(--fg)', fontWeight: 600 }}>
          {hora}h · {f1(v)} mm/s
        </text>
      </svg>
      <div className="exemplo-hora">
        <label htmlFor="ex-hora" className="muted">
          Hora do dia: <span className="num">{hora}h</span>
        </label>
        <input id="ex-hora" type="range" min={0} max={23} value={hora} onChange={(e) => setHora(+e.target.value)} />
        <span className="muted num leitura">
          medido {f1(v)} · normal {f1(m)} ± {f1(2 * s)} mm/s · corrente {f0(corr)} % In
        </span>
      </div>
      <div className="cobertura">
        {[fase1, fase2, fase3].map((fs) => (
          <div key={fs.titulo} className={'cov ' + fs.nivel}>
            <span className="ic">{fs.nivel === 'ok' ? '✓' : fs.nivel === 'crit' ? '!' : fs.nivel === 'warn' ? '!' : 'i'}</span>
            <div>
              <b>{fs.titulo}</b>
              <p>{fs.texto}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
