import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase, rpc, readAll } from '../lib/supabase'
import AV from '../lib/engine'
import { useAuth } from './AuthContext'

const Ctx = createContext(null)
const ms = (t) => (t ? Date.parse(t) : null)

// Turns database rows into the shapes the engine works with.
async function loadState() {
  const [profiles, events, requests, pos, decisions, tasks, audit, settings, exceptions, notes, reads, sensor, batches, readers, accReqs, h3] = await Promise.all([
    readAll('profiles', 'name'), readAll('events', 'id'), readAll('requests', 'ts'), readAll('pos', 'id'),
    readAll('rec_decisions', 'updated_at'), readAll('tasks', 'id'), readAll('audit', 'id'), readAll('settings', 'key'),
    readAll('exceptions', 'id'), readAll('notifications', 'id'), readAll('notification_reads', 'notification'), readAll('sensor_reads', 'id'),
    readAll('erp_batches', 'id'), readAll('readers', 'id'), readAll('account_requests', 'id'), readAll('h3_log', 'id'),
  ])
  AV.users = profiles.map((p) => ({ id: p.id, handle: p.handle, name: p.name, role: p.role, scope: p.scope || [], supplier: p.supplier, email: p.email, active: p.active !== false, mustChange: !!p.must_change_password, createdAt: ms(p.created_at) }))
  AV.userBy = Object.fromEntries(AV.users.map((u) => [u.id, u]))
  const S = {
    events: events.map((e) => ({ id: 'EV-' + String(e.id).padStart(5, '0'), dbid: e.id, ts: ms(e.ts), type: e.type, item: e.item, pn: e.pn, qty: e.qty == null ? null : Number(e.qty), from: e.from_st, to: e.to_st, trf: e.trf, ref: e.ref, aircraft: e.aircraft, cond: e.cond, cert: e.cert, reason: e.reason, expiry: ms(e.expiry), actor: e.actor, source: e.source })),
    requests: requests.map((r) => ({ id: r.id, pn: r.pn, qty: r.qty, station: r.station, aircraft: r.aircraft, wo: r.wo, priority: r.priority, status: r.status, by: r.by_user, ts: ms(r.ts), note: r.note })),
    pos: pos.map((o) => ({ id: o.id, sup: o.sup, pn: o.pn, qty: o.qty, station: o.station, value: Number(o.value), status: o.status, sent: ms(o.sent), acknowledged: ms(o.acknowledged), promised: ms(o.promised), shipped: ms(o.shipped), received: ms(o.received), tracking: o.tracking, approvals: (o.approvals || []).map((a) => ({ by: a.by, ts: ms(a.ts) })), aog: o.aog, note: o.note, certUploaded: o.cert_uploaded })),
    recDecisions: Object.fromEntries(decisions.map((d) => [d.id, { status: d.status, approvals: (d.approvals || []).map((a) => ({ by: a.by, ts: ms(a.ts) })), po: d.po, note: d.note, raisedBy: d.raised_by }])),
    tasks: tasks.map((t) => ({ id: t.id, pn: t.pn, qty: t.qty, from: t.from_st, to: t.to_st, req: t.req, status: t.status, why: t.why })),
    audit: audit.map((a) => ({ ts: ms(a.ts), by: a.by_user, action: a.action, object: a.object, detail: a.detail })),
    exceptions: exceptions.map((x) => ({ id: x.id, ts: ms(x.ts), kind: x.kind, object: x.object, station: x.station, detail: x.detail, status: x.status, resolvedBy: x.resolved_by, resolvedAt: ms(x.resolved_at), note: x.note })),
    notifications: notes.map((n) => ({ id: n.id, ts: ms(n.ts), kind: n.kind, object: n.object, body: n.body, station: n.station })).sort((a, b) => b.ts - a.ts),
    readIds: new Set(reads.map((r) => r.notification)),
    sensorReads: sensor.map((r) => ({ id: r.id, ts: ms(r.ts), reader: r.reader, item: r.item, result: r.result })).sort((a, b) => b.ts - a.ts),
    erpBatches: batches.map((b) => ({ id: b.id, ts: ms(b.ts), by: b.by_user, filename: b.filename, system: b.system, rows: b.rows, rejected: b.rejected || [] })),
    readers,
    h3Log: h3.map((r) => ({ ...r, ts: ms(r.ts) })),
    accountRequests: accReqs.map((q) => ({ id: q.id, ts: ms(q.ts), kind: q.kind, target: q.target, email: q.email, name: q.name, role: q.role, scope: q.scope || [], supplier: q.supplier, by: q.requested_by, status: q.status, decidedBy: q.decided_by, decidedAt: ms(q.decided_at) })).sort((a, b) => b.id - a.id),
    limit: 5000,
    pendingLimit: null,
  }
  for (const s of settings) {
    if (s.key === 'limit') S.limit = Number(s.value)
    if (s.key === 'pending_limit') S.pendingLimit = { value: Number(s.value.value), by: s.value.by }
  }
  S.items = AV.project(S.events)
  const lead = AV.observedLead(S)
  AV.leadFactor = Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, v.factor]))
  S.leadStats = lead
  return S
}

// Live data for the signed-in person: everything they may read, refreshed by realtime
// whenever anyone changes anything, plus `act` for calling server functions.
export function LiveProvider({ children }) {
  const { session, role } = useAuth()
  const [S, setS] = useState(null)
  const [error, setError] = useState(null)
  const [scanner, setScanner] = useState(false)
  const [latencies, setLatencies] = useState([])
  const pending = useRef({})
  const timer = useRef(0)

  const reload = useCallback(async () => {
    try {
      const st = await loadState()
      setS(st); setError(null)
      // Test hook for the H1 harness: which ledger event this browser has loaded, and when.
      window.__avilo = { rpc, lastEventId: st.events.length ? st.events[st.events.length - 1].dbid : 0, loadedAt: performance.now() }
    } catch (e) { setError(e.message) }
  }, [])

  useEffect(() => {
    if (!session) { setS(null); return }
    reload()
    const ch = supabase.channel('avilo-live').on('postgres_changes', { event: '*', schema: 'public' }, (p) => {
      if (p.table === 'events' && p.new && pending.current[p.new.id]) {
        const l = performance.now() - pending.current[p.new.id]
        delete pending.current[p.new.id]
        setLatencies((x) => x.concat(l).slice(-20))
      }
      window.__aviloRt = (window.__aviloRt || 0) + 1
      clearTimeout(timer.current)
      timer.current = setTimeout(reload, 250)
    }).subscribe((status, err) => {
      (window.__aviloCh = window.__aviloCh || []).push([Math.round(performance.now()), status, err ? String(err.message || err) : ''])
      // Changes made while the channel was joining or reconnecting are never replayed, so catch up on (re)join.
      if (status === 'SUBSCRIBED') reload()
    })
    // Safety net: refresh when the tab comes back into view, and once a minute regardless.
    const onVis = () => { if (!document.hidden) reload() }
    document.addEventListener('visibilitychange', onVis)
    const every = setInterval(() => { if (!document.hidden) reload() }, 60000)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis); clearInterval(every) }
  }, [session, reload])

  // Scanner simulator: posts stock issues through the same server door as a real scanner.
  useEffect(() => {
    if (!scanner || !session || role === 'supplier') return
    const id = setInterval(async () => {
      if (document.hidden) return
      const t = performance.now()
      try { const evId = await rpc('scanner_tick'); if (evId) pending.current[evId] = t } catch (e) { setScanner(false); toast.error(e.message) }
    }, 8000)
    return () => clearInterval(id)
  }, [scanner, session, role])

  const act = useCallback(async (fn, args, okMessage) => {
    try {
      const r = await rpc(fn, args)
      toast.success(okMessage || (typeof r === 'string' ? r : 'Done.'))
      await reload()
      return true
    } catch (e) {
      toast.error(e.message)
      return false
    }
  }, [reload])

  return <Ctx.Provider value={{ S, error, reload, act, scanner, setScanner, latencies }}>{children}</Ctx.Provider>
}

export const useLive = () => useContext(Ctx)
