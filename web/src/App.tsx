import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'

const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })))
const ParcelPage = lazy(() =>
  import('./pages/ParcelPage').then((m) => ({ default: m.ParcelPage }))
)
const AssumptionsPage = lazy(() =>
  import('./pages/AssumptionsPage').then((m) => ({ default: m.AssumptionsPage }))
)
const HomesteadExemptionsPage = lazy(() =>
  import('./pages/HomesteadExemptionsPage').then((m) => ({
    default: m.HomesteadExemptionsPage,
  }))
)

function PageLoading() {
  return <p className="page-meta">Loading…</p>
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="map" element={<MapPage />} />
            <Route path="home/:parcelId" element={<ParcelPage />} />
            <Route path="assumptions" element={<AssumptionsPage />} />
            <Route path="homestead-exemptions" element={<HomesteadExemptionsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
