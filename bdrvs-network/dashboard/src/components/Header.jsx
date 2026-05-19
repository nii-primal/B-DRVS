import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getHealth } from '../api/client.js';

/**
 * Site header — branding, primary navigation, and a live gateway status dot.
 * The dot polls /api/health every 10s; green = up, red = down.
 */
export default function Header() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        await getHealth();
        if (mounted) setOnline(true);
      } catch {
        if (mounted) setOnline(false);
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const label = import.meta.env.VITE_DEPLOYMENT_LABEL || 'Prototype';

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <NavLink to="/" className="brand">
          <div className="brand__crest" aria-hidden>
            G
          </div>
          <div className="brand__text">
            <span className="brand__title">B-DRVS</span>
            <span className="brand__sub">Ministry of Health · Ghana</span>
          </div>
        </NavLink>

        <nav className="site-nav" aria-label="Primary">
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/violations">Violations</NavLink>
          <NavLink to="/register">Register server</NavLink>
        </nav>

        <div className="header__status" title={online ? 'Gateway reachable' : 'Gateway unreachable'}>
          <span className={`header__dot ${online ? '' : 'down'}`} />
          <span>{online ? `Gateway · ${label}` : 'Gateway offline'}</span>
        </div>
      </div>
    </header>
  );
}
