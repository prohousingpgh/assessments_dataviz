import { Link, Outlet, useLocation } from 'react-router-dom'

const nav = [
  { to: '/', label: 'Look up your home' },
  { to: '/assumptions', label: 'How we estimate' },
]

export function Layout() {
  const { pathname } = useLocation()

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="site-title">
            Allegheny Home Assessment Explorer
          </Link>
          <nav className="site-nav" aria-label="Main">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={pathname === item.to ? 'nav-link active' : 'nav-link'}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="site-tagline">Pro-Housing Pittsburgh · Illustrative reassessment estimates for homeowners</p>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>
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
