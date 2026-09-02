import { Link, NavLink, Outlet } from 'react-router-dom'
import logo from '../assets/logo_white.webp'

const POLICY_ARTICLE_URL =
  'https://www.prohousingpgh.org/blog/policy-property-tax-assessments'

const nav = [
  { to: '/', label: 'Search', end: true },
  { to: '/map', label: 'Map', end: false },
  { to: '/assumptions', label: 'Methodology', end: true },
  { to: '/homestead-exemptions', label: 'Homestead', end: true },
]

export function Layout() {
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
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
            <span className="site-title">
              Home Assessment Explorer{' '}
              <span className="site-beta" title="Preview release — features and data may change">
                Beta
              </span>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Main">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? 'nav-link active' : 'nav-link'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="footer-left">
            <p className="footer-org">
              A project of{' '}
              <a href="https://www.prohousingpgh.org/" target="_blank" rel="noreferrer">
                Pro-Housing Pittsburgh
              </a>
            </p>
            <p className="footer-disclaimer">
              Not legal or tax advice. Estimates from the{' '}
              <a
                href="https://github.com/prohousingpgh/agc_assessments"
                target="_blank"
                rel="noreferrer"
              >
                agc_assessments
              </a>{' '}
              model pipeline.
            </p>
          </div>
          <div className="footer-right">
            <ul className="footer-links">
              <li>
                <Link to="/assumptions">Methodology</Link>
              </li>
              <li>
                <Link to="/homestead-exemptions">Homestead exclusions</Link>
              </li>
              <li>
                <a href={POLICY_ARTICLE_URL} target="_blank" rel="noreferrer">
                  Policy brief
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/prohousingpgh/agc_assessments"
                  target="_blank"
                  rel="noreferrer"
                >
                  agc_assessments
                </a>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  )
}
