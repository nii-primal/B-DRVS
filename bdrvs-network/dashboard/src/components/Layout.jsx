import { NavLink, useLocation } from 'react-router-dom'
import './Layout.css'
const NAV=[
  {to:'/',label:'Overview',icon:'⬡'},
  {to:'/violations',label:'Violations',icon:'⚠'},
  {to:'/register',label:'Register Server',icon:'+'},
]
export default function Layout({children}){
  return(
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-shield">B</div>
          <div>
            <div className="brand-title">B-DRVS</div>
            <div className="brand-sub">Data Residency Monitor</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(n=>(
            <NavLink key={n.to} to={n.to} end={n.to==='/'} className={({isActive})=>`nav-item${isActive?' active':''}`}>
              <span className="nav-icon">{n.icon}</span><span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="footer-label">Ministry of Health</div>
          <div className="footer-label">Republic of Ghana</div>
          <div className="footer-chain">Hyperledger Fabric 2.5</div>
          <div className="footer-channel">bdrvschannel</div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-path">{useCrumb()}</div>
          <div className="topbar-right">
            <div className="status-dot green"/>
            <span className="status-text">Network Operational</span>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  )
}
function useCrumb(){
  const {pathname}=useLocation()
  const parts=pathname.split('/').filter(Boolean)
  if(!parts.length) return 'Overview'
  return parts.map(p=>p.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())).join(' / ')
}
