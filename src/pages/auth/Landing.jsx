import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AV from '../../lib/engine'
import { Globe, Plane } from '../../components/Scene3D'
import Logo from '../../components/Logo'
import Icon from '../../components/icons'
import { Chip } from '../../components/ui'

const H = 36e5
// Illustrative network for the public page: the same scenario the demo database starts with.
function demoNetwork() {
  const now = Date.now()
  const t = (trf, from, to, hoursAgo, pn) => ({ trf, from, to, ts: now - hoursAgo * H, overdue: hoursAgo > AV.OVERDUE_HOURS, items: [{ id: trf, pn, qty: 1 }] })
  return {
    transits: [t('TRF-0417', 'LHR', 'SIN', 59 * 24, '3214552-3'), t('TRF-0428', 'SIN', 'LHR', 122, 'VT-622-0450'), t('TRF-0431', 'DXB', 'LOS', 27, 'OF-1290-8'), t('TRF-0432', 'LHR', 'DXB', 49, 'TY-H44-5')],
    pos: [{ sup: 'SUP-1', station: 'LOS' }, { sup: 'SUP-1', station: 'SIN' }, { sup: 'SUP-2', station: 'SIN' }, { sup: 'SUP-3', station: 'LHR' }],
    stations: { LHR: { label: '3 below ROP', alert: true }, SIN: { label: '2 below ROP', alert: true }, LOS: { label: 'Stock OK' }, DXB: { label: 'Stock OK' } },
  }
}

const ZONES = [['engL', 'Hydraulic pump', 'ATA 29'], ['mainGear', 'Brake assembly', 'ATA 32'], ['avionics', 'Air data computer', 'ATA 34'], ['apu', 'APU starter-generator', 'ATA 49']]

const ROLES = [
  ['Supply Chain Planner', 'Watches the control tower, approves reorders below the limit, sends spare stock across stations.'],
  ['Stores Operator', 'Scans every receipt, issue and transfer at their own stations. Confirms what arrives.'],
  ['Technician', 'Finds a part at any station or in transit, and raises routine or AOG requests.'],
  ['Procurement Manager', 'Gives the second approval on high-value orders and tracks supplier performance.'],
  ['Compliance Officer', 'Verifies Form 1 and 8130-3 certificates. Quarantines, releases or scraps parts.'],
  ['Supplier', 'Sees only its own orders: confirm, upload the certificate, ship.'],
  ['Admin', 'Runs users and stations. Cannot approve spend or change limits alone.'],
  ['Super Admin', 'Platform support with read-only reach and a full audit trail.'],
  ['Management viewer', 'Reads inventory value, stockouts and the evidence. Changes nothing.'],
]

function useEvidence() {
  const [r, setR] = useState(null)
  useEffect(() => {
    let alive = true, n = 0
    const acc = { A: 0, B: 0, C: 0 }
    const step = () => {
      if (!alive) return
      const s = AV.simAll(AV.SEED + n, { shift: 0 })
      for (const k of 'ABC') acc[k] += s[k].critical
      n++
      if (n < 10) setTimeout(step, 0)
      else setR({ A: acc.A / n, B: acc.B / n, C: acc.C / n })
    }
    const id = setTimeout(step, 600)
    return () => { alive = false; clearTimeout(id) }
  }, [])
  return r
}

export default function Landing() {
  const net = useMemo(demoNetwork, [])
  const [zone, setZone] = useState(0)
  const ev = useEvidence()

  return (
    <div className="landing">
      <header className="lnav">
        <Link to="/" className="lbrandmark" aria-label="Avilo"><Logo height={26} /></Link>
        <nav className="hide-sm">
          <a href="#problem">The problem</a><a href="#how">How it works</a><a href="#roles">Roles</a><a href="#evidence">Evidence</a>
        </nav>
        <Link className="btn primary" to="/login">Sign in</Link>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><span className="dot" />Aviation spares control tower</span>
          <h1>Every aircraft part, located.</h1>
          <p className="lead">Avilo tracks every rotable and consumable across your stations, predicts what you will need next, and routes reorders through approval to suppliers. An aircraft never waits for a part that was in the network all along.</p>
          <div className="row">
            <Link className="btn primary lg" to="/login">Sign in to the demo <Icon name="arrow" /></Link>
            <a className="btn ghost-light lg" href="#how">See how it works</a>
          </div>
          <dl className="hero-facts">
            <div><dt>4</dt><dd>stations on one ledger</dd></div>
            <div><dt>9</dt><dd>roles, rules enforced in the database</dd></div>
            <div><dt>&lt;1 s</dt><dd>from scan to every screen</dd></div>
          </dl>
        </div>
        <div className="hero-art">
          <Globe data={net} height={560} />
          <div className="float f1"><span className="label">HP-10482 · hydraulic pump</span><b>In transit LHR → SIN</b><Chip k="overdue">Overdue 59 d</Chip></div>
          <div className="float f2"><span className="label">AVL-04 · Singapore</span><b>Brake reserved at DXB</b><Chip k="aog" /></div>
          <div className="float f3"><span className="label">Reorder · air data computer</span><b>Planner ✓ · Procurement pending</b></div>
        </div>
      </section>

      <section className="band" id="problem">
        <div className="band-in">
          <span className="eyebrow dark">The problem</span>
          <h2>The pump that wasn’t there.</h2>
          <div className="story">
            <div><span className="step">Monday</span><b>Spreadsheet: 1 hydraulic pump at London.</b><p>Nobody keyed in the transfer to Singapore two months ago.</p></div>
            <div><span className="step">Thursday</span><b>C-check opens. The bin is empty.</b><p>The aircraft is on the ground and the hangar is booked.</p></div>
            <div><span className="step">Friday</span><b>A USD 10,000 part ships for USD 25,000.</b><p>Overall surplus, local shortage. An information gap, not a stock gap.</p></div>
          </div>
        </div>
      </section>

      <section className="band alt" id="how">
        <div className="band-in">
          <span className="eyebrow dark">How it works</span>
          <h2>One ledger. Three jobs.</h2>
          <div className="pillars">
            <article>
              <Icon name="globe" size={22} />
              <h3>See every part</h3>
              <p>Every receipt, issue and transfer is an event in an append-only ledger. Stock is derived from it, never typed over, so a part in transit shows as in transit and an overdue transfer raises an alert.</p>
              <ul><li>Scanner, ERP and people use the same validated door</li><li>Full history for any serial or batch</li></ul>
            </article>
            <article>
              <Icon name="chart" size={22} />
              <h3>Predict what’s needed</h3>
              <p>Spare-parts demand is sparse. Avilo forecasts with Croston, SBA and TSB, sets service level by criticality, and always shows the classic reorder point beside its own.</p>
              <ul><li>Every recommendation states its reason</li><li>Suggests a transfer before a purchase</li></ul>
            </article>
            <article>
              <Icon name="truck" size={22} />
              <h3>Order with control</h3>
              <p>The engine recommends; people approve. Orders above the limit need the Planner and the Procurement Manager. Suppliers confirm, upload certificates and ship in their own portal.</p>
              <ul><li>AOG fast path with review within 24 h</li><li>Lead-time scorecards from real dates</li></ul>
            </article>
          </div>
        </div>
      </section>

      <section className="band dark">
        <div className="band-in split-2">
          <div className="stack">
            <span className="eyebrow">Find it on the aircraft</span>
            <h2>From the bin to the wing.</h2>
            <p className="lead">A technician picks the part. Avilo shows where it sits on the aircraft, where serviceable units are across the network, and reserves the nearest one when the aircraft is on the ground.</p>
            <div className="zones">
              {ZONES.map(([z, name, ata], i) => (
                <button key={z} className={zone === i ? 'on' : ''} onClick={() => setZone(i)}><b>{name}</b><span className="mono">{ata} · {AV.zones[z]}</span></button>
              ))}
            </div>
          </div>
          <Plane zone={ZONES[zone][0]} label={`${ZONES[zone][1]} · ${AV.zones[ZONES[zone][0]]}`} kind="loc" height={440} />
        </div>
      </section>

      <section className="band" id="roles">
        <div className="band-in">
          <span className="eyebrow dark">Roles</span>
          <h2>Nine roles. Nobody approves their own spending.</h2>
          <div className="roles">
            {ROLES.map(([r, d]) => <article key={r}><b>{r}</b><p>{d}</p></article>)}
          </div>
          <p className="note">Access is checked by the database on every action, not by hiding buttons. The person who raises a request cannot approve it, the Admin cannot approve spend, and a supplier can never read the stock ledger.</p>
        </div>
      </section>

      <section className="band alt" id="evidence">
        <div className="band-in split-2">
          <div className="stack">
            <span className="eyebrow dark">Evidence</span>
            <h2>Most of the gain is information.</h2>
            <p>The simulation lab runs the same year three ways across 17 parts and 4 stations. Seeing stock in real time does most of the work; forecasting adds more when demand changes.</p>
            <p className="small muted">Simulated data. These results test the design; they are not measured savings.</p>
          </div>
          <div className="evidence">
            <span className="label">Critical stockouts per simulated year · mean of 10 runs</span>
            {ev ? (
              <div className="bars">
                {[['A · Weekly spreadsheet', ev.A, ''], ['B · Real-time ledger', ev.B, 'b'], ['C · Full Avilo', ev.C, 'c']].map(([l, v, c]) => (
                  <div className="bar" key={l}><span>{l}</span><span className="track"><span className={`fill ${c}`} style={{ width: `${(v / Math.max(ev.A, ev.B, ev.C)) * 100}%` }} /></span><span className="mono num">{v.toFixed(1)}</span></div>
                ))}
              </div>
            ) : <div className="small muted">Running the simulation…</div>}
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="band-in">
          <h2>Open the control tower.</h2>
          <p>Sign in with a demo account to see the network, confirm the lost pump, and approve a reorder.</p>
          <Link className="btn primary lg" to="/login">Sign in <Icon name="arrow" /></Link>
        </div>
      </section>

      <footer className="lfoot">
        <Logo height={20} />
        <span>Capstone prototype · Digital Inventory Visibility and Replenishment Framework · all data simulated</span>
      </footer>
    </div>
  )
}
