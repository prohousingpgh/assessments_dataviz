import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AssumptionsPage } from './pages/AssumptionsPage'
import { HomesteadExemptionsPage } from './pages/HomesteadExemptionsPage'
import { HomePage } from './pages/HomePage'
import { ParcelPage } from './pages/ParcelPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="home/:parcelId" element={<ParcelPage />} />
          <Route path="assumptions" element={<AssumptionsPage />} />
          <Route path="homestead-exemptions" element={<HomesteadExemptionsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
