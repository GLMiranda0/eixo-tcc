/**
 * Coletor virtual: reproduz o ensaio da bancada do TCC.
 * Ao subir a carga, corrente e rotação sobem e a vibração sai da zona B
 * para C e D (ISO 10816-3). Envia para o mesmo endpoint do ESP32.
 */
import { ingest } from './supabase'

const rnd = (a: number) => (Math.random() - 0.5) * a

export function amostra(carga: number, comRot = false) {
  const over = Math.max(0, carga - 0.6) / 0.4
  const p: Record<string, number> = {
    temp: +(46 + carga * 18 + over * 14 + rnd(0.8)).toFixed(1),
    corr: +(8.2 + carga * 3.2 + over * 2.4 + rnd(0.25)).toFixed(2),
    vib: +(1.4 + carga * 2.1 + over * 3.8 + rnd(0.18)).toFixed(2),
  }
  if (comRot) p.rot = Math.round(1715 + carga * 55 + over * 40 + rnd(4))
  return p
}

export class ColetorVirtual {
  private timer: number | null = null
  carga = 0.4
  comRot = false
  enviados = 0
  ultimoErro: string | null = null
  onTick?: (p: Record<string, number>) => void

  constructor(private token: string, private intervaloMs = 1000) {}

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
    const p = amostra(this.carga, this.comRot)
    try {
      await ingest(this.token, p)
      this.enviados++
      this.ultimoErro = null
    } catch (e) {
      this.ultimoErro = (e as Error).message
    }
    this.onTick?.(p)
  }
}
