import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { useTema } from './lib/theme'
import type { Papel } from './lib/types'
import { Shell } from './components/Shell'
import { Login, fluxoLogin } from './pages/Login'
import { Painel } from './pages/Painel'
import { Motores } from './pages/Motores'
import { Motor } from './pages/Motor'
import { Alertas } from './pages/Alertas'
import { Tutorial } from './pages/Tutorial'
import { Usuarios } from './pages/Usuarios'
import { Auditoria } from './pages/Auditoria'
import { Dev } from './pages/Dev'

function Privado() {
  const { session, carregando } = useAuth()
  if (carregando) return <p className="muted" style={{ padding: 24 }}>Carregando…</p>
  return session ? <Shell /> : <Navigate to="/login" replace />
}

/** Renderiza a página só para os papéis listados; os demais voltam para a visão geral. */
function SoPapel({ papeis, children }: { papeis: Papel[]; children: ReactNode }) {
  const { papel, carregandoPerfil } = useAuth()
  if (carregandoPerfil) return <p className="muted">Carregando…</p>
  if (!papel || !papeis.includes(papel)) return <Navigate to="/painel" replace />
  return <>{children}</>
}

function Rotas() {
  useTema()
  const { session, recuperandoSenha } = useAuth()
  // chegou pelo link de recuperação do e-mail: só a tela de nova senha, em qualquer rota
  if (recuperandoSenha) return <Login modoInicial="nova" />
  return (
    <Routes>
      <Route path="/login" element={session && !fluxoLogin.recuperando ? <Navigate to={fluxoLogin.destino} replace /> : <Login />} />
      <Route element={<Privado />}>
        <Route path="/painel" element={<Painel />} />
        <Route path="/motores" element={<Motores />} />
        <Route path="/motores/:id" element={<Motor />} />
        <Route path="/alertas" element={<Alertas />} />
        <Route path="/tutorial" element={<Tutorial />} />
        <Route
          path="/usuarios"
          element={
            <SoPapel papeis={['master']}>
              <Usuarios />
            </SoPapel>
          }
        />
        <Route
          path="/auditoria"
          element={
            <SoPapel papeis={['master', 'admin', 'dev']}>
              <Auditoria />
            </SoPapel>
          }
        />
        <Route
          path="/dev"
          element={
            <SoPapel papeis={['dev']}>
              <Dev />
            </SoPapel>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/painel" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Rotas />
      </BrowserRouter>
    </AuthProvider>
  )
}
