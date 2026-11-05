import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { useTema } from './lib/theme'
import { Shell } from './components/Shell'
import { Login } from './pages/Login'
import { Painel } from './pages/Painel'
import { Motores } from './pages/Motores'
import { Motor } from './pages/Motor'
import { Alertas } from './pages/Alertas'
import { Tutorial } from './pages/Tutorial'

function Privado() {
  const { session, carregando } = useAuth()
  if (carregando) return <p className="muted" style={{ padding: 24 }}>Carregando…</p>
  return session ? <Shell /> : <Navigate to="/login" replace />
}

function Rotas() {
  useTema()
  const { session } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/painel" replace /> : <Login />} />
      <Route element={<Privado />}>
        <Route path="/painel" element={<Painel />} />
        <Route path="/motores" element={<Motores />} />
        <Route path="/motores/:id" element={<Motor />} />
        <Route path="/alertas" element={<Alertas />} />
        <Route path="/tutorial" element={<Tutorial />} />
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
