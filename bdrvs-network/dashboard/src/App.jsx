import { Routes, Route } from 'react-router-dom';
import Header from './components/Header.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ServerDetail from './pages/ServerDetail.jsx';
import Violations from './pages/Violations.jsx';
import Register from './pages/Register.jsx';

export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/servers/:id" element={<ServerDetail />} />
          <Route path="/violations" element={<Violations />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="*"
            element={
              <div className="empty-state">
                <h3>Not found</h3>
                <p>That route does not exist on this regulator console.</p>
              </div>
            }
          />
        </Routes>
      </main>
      <footer className="app-footer">
        B-DRVS · Blockchain-Based Data Residency Verification System · UMaT 2026
      </footer>
    </div>
  );
}
