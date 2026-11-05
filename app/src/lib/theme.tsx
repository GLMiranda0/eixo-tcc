import { useEffect, useState } from 'react'

export type Tema = 'light' | 'sys' | 'dark'

export function useTema() {
  const [tema, setTema] = useState<Tema>(() => {
    try {
      return (localStorage.getItem('eixo-theme') as Tema) || 'sys'
    } catch {
      return 'sys'
    }
  })
  useEffect(() => {
    const root = document.documentElement
    if (tema === 'sys') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', tema)
    try {
      localStorage.setItem('eixo-theme', tema)
    } catch {
      /* sem storage */
    }
  }, [tema])
  return { tema, setTema }
}

export function ThemeToggle() {
  const { tema, setTema } = useTema()
  const opts: [Tema, string][] = [
    ['light', 'Claro'],
    ['sys', 'Auto'],
    ['dark', 'Escuro'],
  ]
  return (
    <div className="theme-toggle" role="group" aria-label="Tema">
      {opts.map(([k, l]) => (
        <button key={k} type="button" className={tema === k ? 'on' : ''} onClick={() => setTema(k)}>
          {l}
        </button>
      ))}
    </div>
  )
}
