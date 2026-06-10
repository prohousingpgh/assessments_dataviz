import { useLocation } from 'react-router-dom'
import { AssumptionsPageSkeleton } from './AssumptionsPageSkeleton'
import { HomePageSkeleton } from './HomePageSkeleton'
import { HomesteadPageSkeleton } from './HomesteadPageSkeleton'
import { MapPageSkeleton } from './MapPageSkeleton'
import { ParcelPageSkeleton } from './ParcelPageSkeleton'

export function RouteSkeleton() {
  const { pathname } = useLocation()

  if (pathname.startsWith('/home/')) return <ParcelPageSkeleton />
  if (pathname === '/map') return <MapPageSkeleton />
  if (pathname === '/assumptions') return <AssumptionsPageSkeleton />
  if (pathname === '/homestead-exemptions') return <HomesteadPageSkeleton />

  return <HomePageSkeleton />
}
