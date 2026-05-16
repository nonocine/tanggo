import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SplashScreen from './components/SplashScreen'
import Landing from './pages/Landing'
import TeamCreate from './pages/TeamCreate'
import Lobby from './pages/Lobby'

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
        <Route path="/team-join" element={<div className="p-8">/team-join</div>} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/mission" element={<div className="p-8">/mission</div>} />
        <Route path="/result" element={<div className="p-8">/result</div>} />
        <Route path="/operator" element={<div className="p-8">/operator</div>} />
        <Route path="/admin" element={<div className="p-8">/admin</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
