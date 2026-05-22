import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { api, statusClass, fmtTime } from '../utils/api'
import 'leaflet/dist/leaflet.css'
import './Overview.css'

const KNOWN_SERVERS = ['LHIMS-KORLE-BU-01']
const SERVER_COORDS = {
  'LHIMS-KORLE-BU-01': { lat: 5.5502, lng: -0.2318, label: 'Korle Bu Teaching Hospital, Accra' },
}

export default function Overview() {
  const [violations, setViolations]     = useState([])
  const [serverStatus, setServerStatus] = useState({})
  const [loading, setLoading]           = useState(true)
  const navigate = useNavigate()

  useEffect(() => { fetchAll(); const t=setInterval(fetchAll,30000); return ()=>clearInterval(t) }, [])

  async function fetchAll() {
    try {
      const [vRes, ...statusRes] = await Promise.allSettled([
        api.violations(),
        ...KNOWN_SERVERS.map(id => api.status(id).then(r => ({ id, data: r.data }))),
      ])
      if (vRes.status==='fulfilled') setViolations(vRes.value.data||[])
      const m={}; statusRes.forEach(r=>{ if(r.status==='fulfilled') m[r.value.id]=r.value.data }); setServerStatus(m)
    } finally { setLoading(false) }
  }

  const allServers = KNOWN_SERVERS.map(id=>({ id, status:serverStatus[id], coords:SERVER_COORDS[id]||{lat:7.9465,lng:-1.0232} }))
  const totalMonitored  = allServers.length
  const totalViolations = allServers.filter(s=>s.status?.currentStatus?.toUpperCase().includes('VIOLATION')).length
  const totalCompliant  = allServers.filter(s=>s.status?.currentStatus?.toUpperCase()==='COMPLIANT').length

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:'80px'}}><div className="spinner"/></div>

  return (
    <div className="overview fade-in">
      <div className="stat-row">
        <StatCard label="Servers Monitored" value={totalMonitored}  accent="var(--navy)"/>
        <StatCard label="Compliant"          value={totalCompliant}  accent="var(--gh-green)"/>
        <StatCard label="In Violation"       value={totalViolations} accent="var(--gh-red)" pulse={totalViolations>0}/>
        <StatCard label="Records on Chain"   value={violations.length} accent="var(--gh-gold)"/>
      </div>

      <div className="two-col">
        <div className="card map-card">
          <div className="card-header">
            <span className="card-title">Health Server Locations</span>
            <span className="tag tag-neutral">Ghana</span>
          </div>
          <div className="map-wrap">
            <MapContainer center={[7.9465,-1.0232]} zoom={6} style={{height:'100%',width:'100%'}} attributionControl={false}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"/>
              {allServers.map(srv=>{
                const isV=srv.status?.currentStatus?.toUpperCase().includes('VIOLATION')
                return(
                  <CircleMarker key={srv.id} center={[srv.coords.lat,srv.coords.lng]} radius={14}
                    pathOptions={{color:isV?'#CE1126':'#006B3F',fillColor:isV?'#CE1126':'#006B3F',fillOpacity:.85,weight:2}}>
                    <Popup>
                      <strong>{srv.id}</strong><br/>{srv.coords.label}<br/>
                      <span style={{color:isV?'#CE1126':'#006B3F',fontWeight:600}}>{srv.status?.currentStatus||'UNKNOWN'}</span><br/>
                      <button onClick={()=>navigate(`/servers/${srv.id}`)} style={{marginTop:6,padding:'4px 10px',background:'#0D1B2A',color:'#fff',border:'none',cursor:'pointer',fontSize:11}}>View Detail →</button>
                    </Popup>
                  </CircleMarker>
                )
              })}
            </MapContainer>
          </div>
          <div className="map-legend">
            <span className="legend-item"><span className="dot green"/>Compliant</span>
            <span className="legend-item"><span className="dot red"/>Sovereignty Violation</span>
          </div>
        </div>

        <div className="card violations-card">
          <div className="card-header">
            <span className="card-title">Recent Violations</span>
            <button className="link-btn" onClick={()=>navigate('/violations')}>View all →</button>
          </div>
          {violations.length===0
            ? <div className="empty-state"><div className="empty-icon">✓</div><div>No violations recorded</div></div>
            : <div className="violation-list">
                {[...violations].slice(0,6).map((v,i)=>(
                  <div key={i} className="violation-row" onClick={()=>navigate(`/servers/${v.serverID}`)}>
                    <div className="v-left">
                      <span className="tag tag-violation">VIOLATION</span>
                      <div className="v-server">{v.serverID}</div>
                      <div className="v-reason mono">{v.violationReason||v.status}</div>
                    </div>
                    <div className="v-right">
                      <div className="v-ip mono">{v.publicIP}</div>
                      <div className="v-time">{fmtTime(v.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Monitored Servers</span></div>
        <table className="data-table">
          <thead><tr><th>SERVER ID</th><th>CURRENT IP</th><th>RTT</th><th>STATUS</th><th>LAST CHECK-IN</th><th></th></tr></thead>
          <tbody>
            {allServers.map(srv=>{
              const s=srv.status
              return(
                <tr key={srv.id}>
                  <td className="mono">{srv.id}</td>
                  <td className="mono">{s?.publicIP||'—'}</td>
                  <td className="mono">{s?.rttMs!=null?`${Number(s.rttMs).toFixed(2)} ms`:'—'}</td>
                  <td><span className={`tag ${statusClass(s?.currentStatus)}`}>{s?.currentStatus||'UNKNOWN'}</span></td>
                  <td>{fmtTime(s?.timestamp)}</td>
                  <td><button className="detail-btn" onClick={()=>navigate(`/servers/${srv.id}`)}>Detail →</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
function StatCard({label,value,accent,pulse}){
  return(
    <div className={`stat-card${pulse?' pulse-red':''}`} style={{'--accent':accent}}>
      <div className="stat-accent-bar"/>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
