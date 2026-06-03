import { Link, Outlet, useLocation } from 'react-router-dom'
import logo from '../assets/logo_white.webp'

const nav = [
  { to: '/', label: 'Search' },
  { to: '/map', label: 'Map' },
  { to: '/assumptions', label: 'Methodology' },
]

export function Layout() {
  const { pathname } = useLocation()

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="site-brand">
            <img
              src={logo}
              alt="Pro-Housing Pittsburgh"
              className="site-logo"
              width={160}
              height={40}
            />
            <span className="site-title">Home Assessment Explorer</span>
          </Link>
          <nav className="site-nav" aria-label="Main">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={
                  pathname === item.to ||
                  (item.to !== '/' && pathname.startsWith(item.to))
                    ? 'nav-link active'
                    : 'nav-link'
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="site-tagline">
          Reassessment estimates for Allegheny County homeowners
        </p>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p className="footer-org">
          A project of{' '}
          <a href="https://www.prohousingpgh.org/" target="_blank" rel="noreferrer">
            Pro-Housing Pittsburgh
          </a>
        </p>
        <p className="footer-disclaimer">
          Not legal or tax advice. Estimates from the{' '}
          <a href="https://github.com/prohousingpgh/agc_assessments" target="_blank" rel="noreferrer">
            agc_assessments
          </a>{' '}
          model pipeline.
        </p>
      </footer>
    </div>
  )
}
