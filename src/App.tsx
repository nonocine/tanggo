import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { initTextContents } from './lib/useTextContent'
import AdminProtected from './components/AdminProtected'
import OperatorProtected from './components/OperatorProtected'
import ParticipantGate from './components/ParticipantGate'
import Landing from './pages/Landing'
import Splash from './pages/Splash'
import { hasSeenSplash } from './lib/splashSeen'
import TeamCreate from './pages/TeamCreate'
import TeamJoin from './pages/TeamJoin'
import Lobby from './pages/Lobby'
import Mission from './pages/Mission'
import DaySelect from './pages/DaySelect'
import LocationSelect from './pages/LocationSelect'
import LocationMission from './pages/LocationMission'
import Result from './pages/Result'
import Survey from './pages/Survey'
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import OperatorLogin from './pages/operator/OperatorLogin'
import OperatorDashboard from './pages/operator/OperatorDashboard'

/** 앱 최초 진입(/)에만 붙는 게이트.
 *  이 세션에서 스플래시를 아직 안 봤으면 영상 스플래시로 보낸다.
 *  /admin, /operator 등 다른 경로에는 게이트가 없으므로 운영자·관리자는
 *  절대 스플래시를 거치지 않는다. */
function LandingEntry() {
  if (!hasSeenSplash()) return <Navigate to="/splash" replace />
  return <Landing />
}

function App() {
  useEffect(() => {
    initTextContents()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingEntry />} />
        <Route path="/splash" element={<Splash />} />
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
          path="/day-select"
          element={
            <ParticipantGate>
              <DaySelect />
            </ParticipantGate>
          }
        />
        <Route
          path="/location-select"
          element={
            <ParticipantGate>
              <LocationSelect />
            </ParticipantGate>
          }
        />
        <Route
          path="/location-mission/:locationGroup"
          element={
            <ParticipantGate>
              <LocationMission />
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
        <Route
          path="/survey"
          element={
            <ParticipantGate>
              <Survey />
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
