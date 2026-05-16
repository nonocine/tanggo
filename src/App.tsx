import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './lib/supabase'

function ConnectionTest() {
  const [status, setStatus] = useState<string>('연결 중...')

  useEffect(() => {
    supabase
      .from('tanggo_event_config')
      .select('event_name')
      .eq('id', 1)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setStatus(`❌ ${error.message}`)
        } else {
          setStatus(`✅ Supabase 연결 성공! 행사명: ${data?.event_name}`)
        }
      })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <h1 className="text-3xl font-bold text-center">{status}</h1>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ConnectionTest />} />
        <Route path="/lobby" element={<div>/lobby</div>} />
        <Route path="/mission" element={<div>/mission</div>} />
        <Route path="/result" element={<div>/result</div>} />
        <Route path="/operator" element={<div>/operator</div>} />
        <Route path="/admin" element={<div>/admin</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
