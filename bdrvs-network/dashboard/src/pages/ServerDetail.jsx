import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { api, fmtTime, fmtRtt, statusClass } from '../utils/api'
import './ServerDetail.css'

export default function ServerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [status,  setStatus]  = useState(null)
  const [history, setHistory] = useState([])
  const [stats,   setStats]   = useState(null)
  const [netConfig, setNetConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExp]   = useState(false)

  useEffect(()=>{ fetchAll(); const t=setInterval(fetchAll,30000); return ()=>clearInterval(t) },[id])

  async function fetchAll(){
    try{
      const [sR,hR,stR,cR]=await Promise.allSettled([api.status(id),api.history(id),api.stats(id),api.config()])
      if(sR.status==='fulfilled')  setStatus(sR.value.data)
      if(hR.status==='fulfilled')  setHistory(hR.value.data||[])
      if(stR.status==='fulfilled') setStats(stR.value.data)
      if(cR.status==='fulfilled')  setNetConfig(cR.value.data)
    }finally{ setLoading(false) }
  }

  const rttThreshold     = netConfig?.rttThresholdMs ?? 50
  const storageThreshold = netConfig?.storageLatencyThresholdMs ?? 10

  const chartData=[...history].filter(r=>r.rttMs!=null).slice(-24).map((r,i)=>({
    idx:i+1, rtt:Number(r.rttMs).toFixed(2)*1, status:r.status,
    time:r.timestamp?new Date(r.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):String(i),
  }))

  const storageChartData=[...history].filter(r=>r.storageLatencyMs!=null).slice(-24).map((r,i)=>({
    idx:i+1,
    storage:Number(r.storageLatencyMs).toFixed(4)*1,
    jitter:Number(r.storageJitterMs||0).toFixed(4)*1,
    status:r.storageStatus,
    time:r.timestamp?new Date(r.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):String(i),
  }))

  function handleExport(){
    setExp(true)
    const rows=history.map(r=>`${r.recordID||''}\t${r.timestamp||''}\t${r.publicIP||''}\t${r.rttMs||''}\t${r.storageLatencyMs??''}\t${r.storageJitterMs??''}\t${r.status||''}\t${r.violationReason||''}\t${r.payloadHash||''}`)
    const tsv=['Record ID\tTimestamp (UTC)\tPublic IP\tRTT (ms)\tStorage Latency (ms)\tStorage Jitter (ms)\tStatus\tViolation Reason\tPayload Hash',...rows].join('\n')
    const blob=new Blob([tsv],{type:'text/plain'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a'); a.href=url; a.download=`BDRVS_Evidence_${id}_${new Date().toISOString().split('T')[0]}.tsv`; a.click()
    URL.revokeObjectURL(url); setExp(false)
  }

  if(loading) return <div style={{display:'flex',justifyContent:'center',padding:'80px'}}><div className="spinner"/></div>
  const isV=status?.status?.toUpperCase().includes('VIOLATION')

  return(
    <div className="server-detail fade-in">
      <div className="detail-header">
        <button className="back-btn" onClick={()=>navigate('/')}>← Back</button>
        <div className="detail-id-block">
          <div className="detail-id mono">{id}</div>
          <span className={`tag ${statusClass(status?.status)}`}>{status?.status||'UNKNOWN'}</span>
        </div>
        <button className={`export-btn${exporting?' loading':''}`} onClick={handleExport} disabled={exporting}>
          {exporting?'Preparing…':'↓ Export Evidence Report'}
        </button>
      </div>

      {isV&&status?.violationReason&&(
        <div className="violation-alert">
          <span className="alert-icon">⚠</span>
          <span><strong>SOVEREIGNTY VIOLATION DETECTED:</strong> {status.violationReason}</span>
        </div>
      )}

      <div className="stats-strip">
        <Item label="Current IP"      value={status?.publicIP||'—'} mono/>
        <Item label="RTT"             value={fmtRtt(status?.rttMs)} mono/>
        <Item label="IP Status"       value={status?.ipStatus||'—'} mono/>
        <Item label="Storage Latency" value={fmtRtt(status?.storageLatencyMs)} mono
              accent={status?.storageStatus==='REMOTE_SUSPECTED'?'red':undefined}/>
        <Item label="Storage Status"  value={status?.storageStatus||'—'} mono
              accent={status?.storageStatus==='REMOTE_SUSPECTED'?'red':'green'}/>
        <Item label="Last Check-in"   value={fmtTime(status?.timestamp)}/>
        {stats&&<>
          <Item label="Total Records"   value={stats.totalRecords}/>
          <Item label="Violations"      value={stats.violations} accent="red"/>
          <Item label="Compliance Rate" value={stats.complianceRate?`${stats.complianceRate}%`:'—'} accent="green"/>
        </>}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">RTT Latency Trend (Last {chartData.length} Records)</span>
          <span className="tag tag-warning">{rttThreshold} ms Domestic Threshold</span>
        </div>
        <div className="chart-wrap">
          {chartData.length===0
            ?<div className="empty-state">No latency data available</div>
            :<ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{top:16,right:24,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAECEF"/>
                <XAxis dataKey="time" tick={{fontFamily:'IBM Plex Mono',fontSize:10,fill:'#8A97A8'}} interval="preserveStartEnd"/>
                <YAxis tick={{fontFamily:'IBM Plex Mono',fontSize:10,fill:'#8A97A8'}} unit=" ms" width={60}/>
                <Tooltip contentStyle={{fontFamily:'IBM Plex Mono',fontSize:11,border:'1px solid #D4DDE6',background:'#fff'}} formatter={v=>[`${v} ms`,'RTT']}/>
                <ReferenceLine y={rttThreshold} stroke="#FCD116" strokeDasharray="6 4" strokeWidth={2} label={{value:`${rttThreshold}ms`,fill:'#8a6000',fontSize:10,fontFamily:'IBM Plex Mono',position:'right'}}/>
                <Line type="monotone" dataKey="rtt" stroke="#006B3F" strokeWidth={2}
                  dot={d=><circle key={d.key} cx={d.cx} cy={d.cy} r={4} fill={d.payload.status?.includes('VIOLATION')?'#CE1126':'#006B3F'} stroke="#fff" strokeWidth={1.5}/>}
                  activeDot={{r:6,fill:'#006B3F'}}/>
              </LineChart>
            </ResponsiveContainer>
          }
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Storage I/O Latency Trend (Last {storageChartData.length} Records)</span>
          <span className="tag tag-warning">{storageThreshold} ms Local Storage Threshold</span>
        </div>
        <div className="chart-wrap">
          {storageChartData.length===0
            ?<div className="empty-state">No storage latency data available</div>
            :<ResponsiveContainer width="100%" height={240}>
              <LineChart data={storageChartData} margin={{top:16,right:24,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAECEF"/>
                <XAxis dataKey="time" tick={{fontFamily:'IBM Plex Mono',fontSize:10,fill:'#8A97A8'}} interval="preserveStartEnd"/>
                <YAxis tick={{fontFamily:'IBM Plex Mono',fontSize:10,fill:'#8A97A8'}} unit=" ms" width={60}/>
                <Tooltip contentStyle={{fontFamily:'IBM Plex Mono',fontSize:11,border:'1px solid #D4DDE6',background:'#fff'}} formatter={(v,name)=>[`${v} ms`,name==='storage'?'Storage Latency':'Jitter']}/>
                <ReferenceLine y={storageThreshold} stroke="#FCD116" strokeDasharray="6 4" strokeWidth={2} label={{value:`${storageThreshold}ms`,fill:'#8a6000',fontSize:10,fontFamily:'IBM Plex Mono',position:'right'}}/>
                <Line type="monotone" dataKey="storage" stroke="#0D1B2A" strokeWidth={2}
                  dot={d=><circle key={d.key} cx={d.cx} cy={d.cy} r={4} fill={d.payload.status==='REMOTE_SUSPECTED'?'#CE1126':'#0D1B2A'} stroke="#fff" strokeWidth={1.5}/>}
                  activeDot={{r:6,fill:'#0D1B2A'}}/>
                <Line type="monotone" dataKey="jitter" stroke="#8A97A8" strokeWidth={1} strokeDasharray="4 2" dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          }
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Immutable Audit Trail</span>
          <span className="tag tag-neutral mono">{history.length} records on-chain</span>
        </div>
        <div className="table-scroll">
          <table className="data-table audit-table">
            <thead><tr><th>#</th><th>TIMESTAMP (UTC)</th><th>PUBLIC IP</th><th>RTT</th><th>STORAGE LATENCY</th><th>IP STATUS</th><th>STORAGE STATUS</th><th>STATUS</th><th>PAYLOAD HASH</th></tr></thead>
            <tbody>
              {history.length===0
                ?<tr><td colSpan={9} style={{textAlign:'center',color:'var(--text-muted)',padding:24}}>No records found</td></tr>
                :[...history].reverse().map((r,i)=>(
                  <tr key={i} className={r.status?.includes('VIOLATION')?'row-violation':''}>
                    <td className="mono" style={{color:'var(--text-muted)'}}>{history.length-i}</td>
                    <td className="mono">{fmtTime(r.timestamp)}</td>
                    <td className="mono">{r.publicIP||'—'}</td>
                    <td className="mono">{fmtRtt(r.rttMs)}</td>
                    <td className="mono">{fmtRtt(r.storageLatencyMs)}</td>
                    <td><span className={`tag ${r.ipStatus==='FOREIGN'?'tag-violation':r.ipStatus==='GHANA'?'tag-compliant':'tag-neutral'}`}>{r.ipStatus||'—'}</span></td>
                    <td><span className={`tag ${r.storageStatus==='REMOTE_SUSPECTED'?'tag-violation':r.storageStatus==='LOCAL'?'tag-compliant':'tag-neutral'}`}>{r.storageStatus||'—'}</span></td>
                    <td><span className={`tag ${statusClass(r.status)}`}>{r.status||'—'}</span></td>
                    <td className="mono hash-cell" title={r.payloadHash}>{r.payloadHash?r.payloadHash.slice(0,20)+'…':'—'}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
function Item({label,value,mono,accent}){
  return(
    <div className={`strip-item${accent?` strip-${accent}`:''}`}>
      <div className="strip-label">{label}</div>
      <div className={`strip-value${mono?' mono':''}`}>{value}</div>
    </div>
  )
}

