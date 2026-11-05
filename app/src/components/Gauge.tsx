import { GRANDEZAS, fmt, type Grandeza, type Sev } from '../lib/types'

export function Gauge({ g, valor, sev = 'ok' }: { g: Grandeza; valor: number | null | undefined; sev?: Sev }) {
  const meta = GRANDEZAS[g]
  const p = valor == null ? 0 : Math.min(1, Math.max(0, (valor - meta.min) / (meta.max - meta.min)))
  const cor = sev === 'crit' ? 'var(--crit)' : sev === 'warn' ? 'var(--warn)' : 'inherit'
  return (
    <div className="gauge">
      <svg viewBox="0 0 120 80">
        <path d="M12 68 A48 48 0 1 1 108 68" fill="none" stroke="var(--grid)" strokeWidth="10" strokeLinecap="round" />
        <path className="arc" d="M12 68 A48 48 0 1 1 108 68" fill="none" stroke={meta.cor} strokeWidth="10" strokeLinecap="round" strokeDasharray="226" strokeDashoffset={226 - 226 * p} />
      </svg>
      <span className="val num" style={{ color: cor }}>
        {fmt(g, valor)}
      </span>
      <span className="lbl">
        {meta.nome} ({meta.unidade})
      </span>
    </div>
  )
}

export function NaoMedido({ g }: { g: Grandeza }) {
  const meta = GRANDEZAS[g]
  return (
    <div className="nm">
      <b>{meta.nome} não medida</b>
      <span style={{ fontSize: 12 }}>
        {g === 'rot' ? 'O coletor Eixo não lê rpm. Velocidade nominal assumida.' : 'Opcional. Envie a chave no payload para habilitar.'}
      </span>
      <span className="mono" style={{ fontSize: 11 }}>
        "{g}"
      </span>
    </div>
  )
}
