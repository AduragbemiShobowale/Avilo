import { useEffect, useState } from 'react'
import AV from '../../lib/engine'
import { useLive } from '../../context/LiveContext'
import { PageHead, Card, Chip, Modal, Tile, Empty, part } from '../../components/ui'
import { fTime, downloadCsv } from '../../lib/format'
import { H3_SETS, STEP_LABEL, orderTimes, compare } from '../../lib/h3'

const mins = (ms) => (ms == null ? '–' : `${(ms / 60000).toFixed(1)} min`)
const store = { get: (k, d) => { try { return localStorage.getItem(k) || d } catch (e) { return d } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* ignore */ } } }

function Clock({ from }) {
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(id) }, [])
  const s = Math.floor((Date.now() - from) / 1000)
  return <span className="mono">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
}

// H3 timer screen: kept open on one device between the two volunteers, signed in as the Admin.
export default function H3Session() {
  const { S, act } = useLive()
  const [session, setSession] = useState(store.get('h3-session', 'Team 1'))
  const [arm, setArm] = useState(store.get('h3-arm', 'manual'))
  const [set, setSet] = useState(store.get('h3-set', 'A'))
  const [confirmPrep, setConfirmPrep] = useState(false)
  const [note, setNote] = useState(null)
  useEffect(() => { store.set('h3-session', session); store.set('h3-arm', arm); store.set('h3-set', set) }, [session, arm, set])

  const log = S.h3Log
  const mark = (o, step, extra) => act('h3_mark', { p_session: session, p_arm: arm, p_set: set, p_order: o.n, p_pn: o.pn, p_station: o.station, p_step: step, p_note: extra || null }, `${STEP_LABEL[step] || step} · order ${o.n}`)
  const orders = H3_SETS[set].map((o) => ({ ...o, t: orderTimes(log, S, session, arm, set, o.n) }))
  const running = orders.filter((o) => o.t.start && !o.t.serviceable)
  const sessions = [...new Set(log.map((r) => r.session))]

  return (
    <>
      <PageHead title="H3 session" sub="The timer screen for the time-to-replenish test. Keep it open on one device both volunteers can reach, signed in as the Admin." />
      <Card title="Session">
        <div className="grid g3">
          <label className="field">Session name<input value={session} onChange={(e) => setSession(e.target.value)} placeholder="e.g. Team 1" /></label>
          <div className="field">Method<div className="row">{['manual', 'avilo'].map((a) => <button key={a} className={`btn ${arm === a ? 'primary' : ''}`} onClick={() => setArm(a)}>{a === 'manual' ? 'Manual (spreadsheet + e-mail)' : 'Avilo'}</button>)}</div></div>
          <div className="field">Order set<div className="row">{['A', 'B'].map((x) => <button key={x} className={`btn ${set === x ? 'primary' : ''}`} onClick={() => setSet(x)}>Set {x}</button>)}</div></div>
        </div>
        {arm === 'avilo' && (
          <div className="row">
            <span className="small muted">Before the first Avilo order, prepare the database for Set {set}: it resets the demo world and creates exactly these ten shortages. Accounts are kept.</span>
            <span className="spacer" />
            <button className="btn danger" onClick={() => setConfirmPrep(true)}>Prepare database for Set {set}</button>
          </div>
        )}
        {running.length > 1 && <div className="notice bad small">{running.length} orders are running at once. The protocol is one order at a time.</div>}
      </Card>

      <Card title={`Set ${set} · ${arm === 'manual' ? 'manual method' : 'Avilo'}`} aside="Hand over one card at a time">
        <div className="list">
          {orders.map((o) => {
            const p = part(o.pn), t = o.t, done = !!t.serviceable
            const next = ['approved', 'confirmed', 'received', 'serviceable'].find((k) => !t[k])
            return (
              <div className="li" key={o.n}>
                <span className={`sev ${done ? 'ok' : t.start ? 'warn' : 'loc'}`} />
                <div className="grow">
                  <b>Order {o.n} · {p.name} at {o.station}</b>
                  <span className="small">Card: “Engineering has just used {o.used} {p.unit} of {p.name} (P/N {o.pn}) at {o.station}. Raise a replacement order with {AV.supBy[p.sup].name} and see it through until the part is back on the shelf, serviceable. Always buy; do not transfer from another station.”</span>
                  {t.start && (
                    <span className="small muted">
                      Started {fTime(t.start)}
                      {['approved', 'confirmed', 'received', 'serviceable'].map((k) => t[k] ? ` · ${STEP_LABEL[k].toLowerCase()} ${fTime(t[k])}` : '').join('')}
                      {t.po ? ` · ${t.po}` : ''}{t.errors ? ` · ${t.errors} problem(s) noted` : ''}
                    </span>
                  )}
                  <span className="row">
                    {done ? <Chip k="serviceable">Done in {mins(t.serviceable - t.start)}</Chip> : t.start ? <Chip k="pending"><>Running <Clock from={t.start} /></></Chip> : <Chip k="routine">Not started</Chip>}
                  </span>
                </div>
                <div className="row">
                  {!t.start && <button className="btn primary" onClick={() => mark(o, 'start')}>Start · hand over card</button>}
                  {t.start && !done && arm === 'manual' && next && <button className="btn primary" onClick={() => mark(o, next)}>{STEP_LABEL[next]}</button>}
                  {t.start && !done && arm === 'avilo' && <span className="small muted">Avilo records the steps itself{next ? ` · waiting: ${STEP_LABEL[next].toLowerCase()}` : ''}</span>}
                  {t.start && <button className="btn ghost sm" onClick={() => setNote({ o, kind: 'error' })}>Note a problem</button>}
                  {t.start && !done && <button className="btn ghost sm" onClick={() => setNote({ o, kind: 'void' })}>Void</button>}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Results S={S} log={log} sessions={sessions} />

      {confirmPrep && (
        <Modal title={`Prepare the database for Set ${set}?`} onClose={() => setConfirmPrep(false)}
          actions={<><button className="btn" onClick={() => setConfirmPrep(false)}>Cancel</button><button className="btn danger" onClick={() => { setConfirmPrep(false); act('h3_prepare', { p_set: set }) }}>Reset and prepare</button></>}>
          <p>All demo stock, orders and requests go back to the starting point, then ten shortages for Set {set} are created. Accounts and this session's timings are kept.</p>
        </Modal>
      )}
      {note && (
        <Modal title={note.kind === 'void' ? `Void order ${note.o.n}?` : `Problem on order ${note.o.n}`} onClose={() => setNote(null)}
          actions={<><button className="btn" onClick={() => setNote(null)}>Cancel</button><button className="btn primary" onClick={() => { mark(note.o, note.kind, note.text); setNote(null) }}>Save</button></>}>
          <p className="small muted">{note.kind === 'void' ? 'Use only if the order could not be completed (for example the system went down). It is excluded from the results and can be restarted.' : 'Describe what went wrong, e.g. wrong quantity ordered, approval rule missed, stock sheet not updated. The clock keeps running.'}</p>
          <textarea className="inp" rows={3} value={note.text || ''} onChange={(e) => setNote({ ...note, text: e.target.value })} />
        </Modal>
      )}
    </>
  )
}

function Results({ S, log, sessions }) {
  const [sel, setSel] = useState(sessions[0] || '')
  useEffect(() => { if (!sel && sessions[0]) setSel(sessions[0]) }, [sessions.length])
  if (!sessions.length) return <Card title="Results"><Empty>No timings recorded yet.</Empty></Card>
  const armSet = (arm) => { const r = log.find((x) => x.session === sel && x.arm === arm && x.step === 'start'); return r ? r.set_name : null }
  const mSet = armSet('manual'), aSet = armSet('avilo')
  const rows = [...Array(10)].map((_, i) => {
    const n = i + 1
    const m = mSet ? orderTimes(log, S, sel, 'manual', mSet, n) : null, a = aSet ? orderTimes(log, S, sel, 'avilo', aSet, n) : null
    const tot = (t) => (t && t.start && t.serviceable ? t.serviceable - t.start : null), ac = (t) => (t && t.approved && t.confirmed ? t.confirmed - t.approved : null)
    return { n, m, a, manual: tot(m), avilo: tot(a), mAc: ac(m), aAc: ac(a), mErr: m?.errors || 0, aErr: a?.errors || 0 }
  })
  const c = compare(rows), cAc = compare(rows.map((r) => ({ manual: r.mAc, avilo: r.aAc })))
  return (
    <Card title="Results" aside={<select className="inp auto" value={sel} onChange={(e) => setSel(e.target.value)}>{sessions.map((s) => <option key={s}>{s}</option>)}</select>}>
      <div className="grid g3">
        <Tile label="Time to replenish · manual → Avilo" value={c ? `${(c.manualMean / 60000).toFixed(1)} → ${(c.aviloMean / 60000).toFixed(1)} min` : '–'} note={c ? `${c.n} matched pairs · Avilo faster in ${c.faster}` : 'Needs both methods finished'} />
        <Tile label="Reduction" value={c ? `${c.reduction.toFixed(0)}%` : '–'} note={c ? <>95% CI of the difference {(c.lo / 60000).toFixed(1)} to {(c.hi / 60000).toFixed(1)} min · <Chip k={c.supported ? 'serviceable' : 'overdue'}>{c.supported ? 'H3 rule met' : 'H3 rule not met'}</Chip></> : 'H3: at least 30% shorter, CI below zero'} />
        <Tile label="Approval → supplier confirmation" value={cAc ? `${(cAc.manualMean / 60000).toFixed(1)} → ${(cAc.aviloMean / 60000).toFixed(1)} min` : '–'} note={cAc ? `${cAc.reduction.toFixed(0)}% shorter` : 'Second H3 measure'} />
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Pair</th><th>Manual (set {mSet || '–'})</th><th className="num">Total</th><th className="num">Appr → conf</th><th>Avilo (set {aSet || '–'})</th><th className="num">Total</th><th className="num">Appr → conf</th><th className="num">Problems</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.n}>
              <td>{r.n}</td>
              <td className="small">{mSet ? `${part(H3_SETS[mSet][r.n - 1].pn).name} · ${H3_SETS[mSet][r.n - 1].station}` : '–'}</td><td className="num mono">{mins(r.manual)}</td><td className="num mono">{mins(r.mAc)}</td>
              <td className="small">{aSet ? `${part(H3_SETS[aSet][r.n - 1].pn).name} · ${H3_SETS[aSet][r.n - 1].station}` : '–'}</td><td className="num mono">{mins(r.avilo)}</td><td className="num mono">{mins(r.aAc)}</td>
              <td className="num mono">{r.mErr} / {r.aErr}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="row">
        <span className="small muted">Decision rule fixed before the session: H3 is supported if Avilo's mean time to replenish is at least 30% shorter and the 95% confidence interval of the paired difference lies below zero.</span>
        <span className="spacer" />
        <button className="btn" onClick={() => downloadCsv(`h3_${sel.replace(/\W+/g, '_')}_orders.csv`, rows.map((r) => ({ pair: r.n, manual_set: mSet, manual_pn: mSet ? H3_SETS[mSet][r.n - 1].pn : '', manual_station: mSet ? H3_SETS[mSet][r.n - 1].station : '', manual_total_min: r.manual == null ? '' : (r.manual / 60000).toFixed(2), manual_approval_to_confirmation_min: r.mAc == null ? '' : (r.mAc / 60000).toFixed(2), manual_problems: r.mErr, avilo_set: aSet, avilo_pn: aSet ? H3_SETS[aSet][r.n - 1].pn : '', avilo_station: aSet ? H3_SETS[aSet][r.n - 1].station : '', avilo_po: r.a?.po || '', avilo_total_min: r.avilo == null ? '' : (r.avilo / 60000).toFixed(2), avilo_approval_to_confirmation_min: r.aAc == null ? '' : (r.aAc / 60000).toFixed(2), avilo_problems: r.aErr })))}>Export orders CSV</button>
        <button className="btn" onClick={() => downloadCsv(`h3_${sel.replace(/\W+/g, '_')}_log.csv`, log.filter((r) => r.session === sel).map((r) => ({ id: r.id, ts: new Date(r.ts).toISOString(), arm: r.arm, set: r.set_name, order: r.order_no, pn: r.pn, station: r.station, step: r.step, note: r.note || '' })))}>Export raw log</button>
      </div>
    </Card>
  )
}
