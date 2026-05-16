import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SplashScreen from './components/SplashScreen'
import Landing from './pages/Landing'

function SplashThenLanding() {
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1500)
    return () => clearTimeout(t)
  }, [])

  return showSplash ? <SplashScreen /> : <Landing />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SplashThenLanding />} />
        <Route path="/team-create" element={<div className="p-8">/team-create</div>} />
        <Route path="/team-join" element={<div className="p-8">/team-join</div>} />
        <Route path="/lobby" element={<div className="p-8">/lobby</div>} />
        <Route path="/mission" element={<div className="p-8">/mission</div>} />
        <Route path="/result" element={<div className="p-8">/result</div>} />
        <Route path="/operator" element={<div className="p-8">/operator</div>} />
        <Route path="/admin" element={<div className="p-8">/admin</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
