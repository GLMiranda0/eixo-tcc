interface Serie {
  nome: string
  cor: string
  valores: (number | null)[]
}

interface Props {
  series: Serie[]
  limite?: number
  casas?: number
  rotulosX?: string[]
  altura?: number
  ariaLabel: string
}

export function LineChart({ series, limite, casas = 1, rotulosX = [], altura = 220, ariaLabel }: Props) {
  const W = 800
  const H = altura
  const P = { l: 46, r: 16, t: 14, b: 26 }
  const n = Math.max(2, series[0]?.valores.length ?? 0)
  const todos = series.flatMap((s) => s.valores.filter((v): v is number => v != null)).concat(limite != null ? [limite] : [])
  if (!todos.length) {
    return (
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        <text x={W / 2} y={H / 2} textAnchor="middle">
          Sem leituras ainda
        </text>
      </svg>
    )
  }
  let lo = Math.min(...todos)
  let hi = Math.max(...todos)
  const pad = (hi - lo) * 0.15 || 1
  lo -= pad
  hi += pad
  const x = (i: number) => P.l + (i / (n - 1)) * (W - P.l - P.r)
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b)
  const f = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas })
  const grid = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4)

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {grid.map((v) => (
        <g key={v}>
          <line className="gl" x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} />
          <text x={P.l - 8} y={y(v) + 4} textAnchor="end">
            {f(v)}
          </text>
        </g>
      ))}
      {limite != null && (
        <g>
          <line className="lim" x1={P.l} x2={W - P.r} y1={y(limite)} y2={y(limite)} />
          <text x={P.l + 6} y={y(limite) - 5} style={{ fill: 'var(--crit)' }}>
            limite {f(limite)}
          </text>
        </g>
      )}
      {rotulosX.map((t, i, a) => (
        <text key={i} x={x(Math.round((i * (n - 1)) / (a.length - 1)))} y={H - 8} textAnchor={i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'}>
          {t}
        </text>
      ))}
      {series.map((s) => {
        const pts = s.valores.map((v, i) => (v == null ? null : [x(i), y(v)] as const))
        const d = pts.map((p, i) => (p ? (i === 0 || !pts[i - 1] ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) : '')).join(' ')
        const ult = [...pts].reverse().find(Boolean)
        const ultV = [...s.valores].reverse().find((v) => v != null)
        return (
          <g key={s.nome}>
            <path className="ln" d={d} stroke={s.cor} />
            {ult && (
              <g>
                <circle cx={ult[0]} cy={ult[1]} r="4" fill={s.cor} stroke="var(--surface)" strokeWidth="2" />
                <text x={ult[0] - 8} y={ult[1] - 9} textAnchor="end" style={{ fill: 'var(--fg)', fontWeight: 600 }}>
                  {s.nome} {ultV != null && f(ultV)}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}
