/**
 * Coletor virtual: gera leituras coerentes com a carga aplicada ao eixo e as envia
 * pelo mesmo caminho que um coletor físico (função `ingest`, ou um destino local no modo demonstração).
 * Com a carga subindo, corrente e temperatura sobem e a vibração sai da zona B
 * para C e D (ISO 10816-3).
 */
import { ingest } from './supabase'
import type { Grandeza } from './types'

const rnd = (a: number) => (Math.random() - 0.5) * a

export type Sensores = Partial<Record<Grandeza, boolean>>

export const SENSORES_EIXO: Record<Grandeza, boolean> = { temp: true, corr: true, vib: true, rot: false, tens: false }

/** Leitura simulada para a carga (0..1) com as grandezas habilitadas. */
export function amostra(carga: number, sensores: Sensores = SENSORES_EIXO) {
  const over = Math.max(0, carga - 0.6) / 0.4
  const p: Record<string, number> = {}
  if (sensores.temp) p.temp = +(46 + carga * 18 + over * 14 + rnd(0.8)).toFixed(1)
  if (sensores.corr) p.corr = +(8.2 + carga * 3.2 + over * 2.4 + rnd(0.25)).toFixed(2)
  if (sensores.vib) p.vib = +(1.4 + carga * 2.1 + over * 3.8 + rnd(0.18)).toFixed(2)
  if (sensores.rot) p.rot = Math.round(1715 + carga * 55 + over * 40 + rnd(4))
  if (sensores.tens) p.tens = +(221 - carga * 3 - over * 2 + rnd(1.2)).toFixed(1)
  return p
}

export type Destino = (token: string, payload: Record<string, unknown>) => Promise<unknown>

export class ColetorVirtual {
  private timer: number | null = null
  carga = 0.4
  sensores: Sensores = SENSORES_EIXO
  enviados = 0
  ultimoErro: string | null = null
  onTick?: (p: Record<string, number>) => void

  constructor(
    private token: string,
    private destino: Destino = ingest,
    private intervaloMs = 1000,
  ) {}

  iniciar() {
    if (this.timer) return
    this.timer = window.setInterval(() => this.tick(), this.intervaloMs)
    this.tick()
  }

  parar() {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = null
  }

  get ativo() {
    return this.timer != null
  }

  private async tick() {
    const p = amostra(this.carga, this.sensores)
    try {
      await this.destino(this.token, p)
      this.enviados++
      this.ultimoErro = null
    } catch (e) {
      this.ultimoErro = (e as Error).message
    }
    this.onTick?.(p)
  }
}
