import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, fmtTime, fmtRtt } from '../utils/api'
import './Violations.css'

export default function Violations() {
  const [violations, setViolations] = useState([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState('')
  const navigate = useNavigate()

  useEffect(()=>{ api.violations().then(r=>setViolations(r.data||[])).catch(console.error).finally(()=>setLoading(false)) },[])

  const filtered=violations.filter(v=>!filter||(v.serverID||'').toLowerCase().includes(filter.toLowerCase())||(v.publicIP||'').includes(filter)||(v.violationReason||'').toLowerCase().includes(filter.toLowerCase()))

  if(loading) return <div style={{display:'flex',justifyContent:'center',padding:'80px'}}><div className="spinner"/></div>

  return(
    <div className="violations-page fade-in">
      <div className="page-banner violation-banner">
        <div className="banner-icon">⚠</div>
        <div>
          <div className="banner-title">Sovereignty Violations</div>
          <div className="banner-sub">{violations.length} total violation records on the immutable ledger</div>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">All Violation Records</span>
          <input className="filter-input" placeholder="Filter by server, IP, reason…" value={filter} onChange={e=>setFilter(e.target.value)}/>
        </div>
        {filtered.length===0
          ?<div className="empty-state">
              {violations.length===0?<><div className="empty-icon" style={{color:'var(--gh-green)'}}>✓</div><div>No violations on the ledger</div></>:<div>No records match that filter</div>}
            </div>
          :<table className="data-table">
            <thead><tr><th>RECORD ID</th><th>SERVER</th><th>TIMESTAMP (UTC)</th><th>PUBLIC IP</th><th>IP STATUS</th><th>RTT</th><th>STORAGE LATENCY</th><th>STORAGE STATUS</th><th>VIOLATION REASON</th><th>PAYLOAD HASH</th><th></th></tr></thead>
            <tbody>
              {[...filtered].reverse().map((v,i)=>(
                <tr key={i} className="violation-row">
                  <td className="mono small-text" title={v.recordID}>{v.recordID?v.recordID.slice(0,28)+'…':'—'}</td>
                  <td className="mono server-cell">{v.serverID}</td>
                  <td className="mono">{fmtTime(v.timestamp)}</td>
                  <td className="mono">{v.publicIP||'—'}</td>
                  <td><span className={`tag ${v.ipStatus==='FOREIGN'?'tag-violation':'tag-compliant'}`}>{v.ipStatus||'—'}</span></td>
                  <td className="mono">{fmtRtt(v.rttMs)}</td>
                  <td className="mono">{fmtRtt(v.storageLatencyMs)}</td>
                  <td><span className={`tag ${v.storageStatus==='REMOTE_SUSPECTED'?'tag-violation':'tag-compliant'}`}>{v.storageStatus||'—'}</span></td>
                  <td className="reason-cell">{v.violationReason||v.status||'—'}</td>
                  <td className="mono hash-cell" title={v.payloadHash}>{v.payloadHash?v.payloadHash.slice(0,16)+'…':'—'}</td>
                  <td><button className="detail-btn" onClick={()=>navigate(`/servers/${v.serverID}`)}>Detail →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  )
}

