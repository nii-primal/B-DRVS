import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import ServerDetail from './pages/ServerDetail'
import Violations from './pages/Violations'
import Register from './pages/Register'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"            element={<Overview />} />
          <Route path="/servers/:id" element={<ServerDetail />} />
          <Route path="/violations"  element={<Violations />} />
          <Route path="/register"    element={<Register />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
