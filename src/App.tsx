import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SplashScreen from './components/SplashScreen'
import AdminProtected from './components/AdminProtected'
import OperatorProtected from './components/OperatorProtected'
import ParticipantGate from './components/ParticipantGate'
import Landing from './pages/Landing'
import TeamCreate from './pages/TeamCreate'
import TeamJoin from './pages/TeamJoin'
import Lobby from './pages/Lobby'
import Mission from './pages/Mission'
import Result from './pages/Result'
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import OperatorLogin from './pages/operator/OperatorLogin'
import OperatorDashboard from './pages/operator/OperatorDashboard'

const SPLASH_FLAG = 'tanggo_splash_shown'

function SplashThenLanding() {
  const [showSplash, setShowSplash] = useState(
    () => typeof window !== 'undefined' && !sessionStorage.getItem(SPLASH_FLAG),
  )

  useEffect(() => {
    if (!showSplash) return
    const t = setTimeout(() => {
      setShowSplash(false)
      sessionStorage.setItem(SPLASH_FLAG, '1')
    }, 1500)
    return () => clearTimeout(t)
  }, [showSplash])

  return showSplash ? <SplashScreen /> : <Landing />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SplashThenLanding />} />
        <Route path="/team-create" element={<TeamCreate />} />
        <Route path="/team-join" element={<TeamJoin />} />
        <Route
          path="/lobby"
          element={
            <ParticipantGate>
              <Lobby />
            </ParticipantGate>
          }
        />
        <Route
          path="/mission"
          element={
            <ParticipantGate>
              <Mission />
            </ParticipantGate>
          }
        />
        <Route
          path="/result"
          element={
            <ParticipantGate>
              <Result />
            </ParticipantGate>
          }
        />
        <Route path="/operator" element={<OperatorLogin />} />
        <Route
          path="/operator/dashboard"
          element={
            <OperatorProtected>
              <OperatorDashboard />
            </OperatorProtected>
          }
        />
        <Route path="/admin" element={<AdminLogin />} />
        <Route
          path="/admin/dashboard"
          element={
            <AdminProtected>
              <AdminDashboard />
            </AdminProtected>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
