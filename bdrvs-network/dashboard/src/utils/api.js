import axios from 'axios'
const BASE = '/api'
export const api = {
  health:     () => axios.get(`${BASE}/health`),
  config:     () => axios.get(`${BASE}/config`),
  violations: () => axios.get(`${BASE}/violations`),
  status:   id => axios.get(`${BASE}/status/${id}`),
  history:  id => axios.get(`${BASE}/history/${id}`),
  stats:    id => axios.get(`${BASE}/stats/${id}`),
  register: p  => axios.post(`${BASE}/register`, p),
  checkin:  p  => axios.post(`${BASE}/checkin`, p),
}
export function statusClass(s){
  if(!s) return 'tag-neutral'
  const u=s.toUpperCase()
  if(u==='COMPLIANT') return 'tag-compliant'
  if(u.includes('VIOLATION')) return 'tag-violation'
  return 'tag-warning'
}
export function fmtTime(ts){
  if(!ts) return '—'
  try{ return new Date(ts).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'UTC',timeZoneName:'short'}) }
  catch{ return ts }
}
export function fmtRtt(r){ return r==null?'—':`${Number(r).toFixed(2)} ms` }
