import { Link } from 'react-router-dom'
import AV from '../../lib/engine'
import { useAuth } from '../../context/AuthContext'
import { useLive } from '../../context/LiveContext'
import { ROLE_GUIDE } from '../../lib/guide'
import { ROLE_LABEL, usd, fDT } from '../../lib/format'
import { PageHead, Tile, Card, uname } from '../../components/ui'

// Home for the Admin and the Super Admin: the state of the system in plain words.
export default function Overview() {
  const { profile, role } = useAuth()
  const { S, act } = useLive()
  const g = ROLE_GUIDE[role]
  const od = AV.transits(S).filter((t) => t.overdue).length
  const aog = S.requests.filter((r) => r.status === 'Open' && r.priority === 'AOG').length
  const recent = S.audit.slice().sort((a, b) => b.ts - a.ts).slice(0, 5)

  return (
    <>
      <PageHead title={`Welcome, ${profile.name}`} sub={`${ROLE_LABEL[role]}. ${g.who}`}>
        <Link className="btn" to="/how-it-works">How Avilo works</Link>
      </PageHead>
      <div className="grid g4">
        <Tile label="People using Avilo" value={AV.users.length} note={`${new Set(AV.users.map((u) => u.role)).size} different roles`} />
        <Tile label="Stations" value={AV.stations.length} note={AV.stations.map((s) => s.code).join(' · ')} />
        <Tile label="Approval limit" value={usd(S.limit).replace('USD ', '')} note={S.pendingLimit ? <b>A change is waiting for approval</b> : 'USD · orders above need two approvals'} tone={S.pendingLimit ? 'warn' : ''} />
        <Tile label="Problems right now" value={od + aog} tone={od + aog ? 'warn' : 'ok'} note={<b>{od} late transfers · {aog} grounded aircraft</b>} />
      </div>
      <div className="grid g2 top">
        <Card title="What you can do here">
          <div className="links">
            <Link to="/access"><b>Users & limits</b><span>See everyone, their role and stations, and the approval limit.</span></Link>
            <Link to="/audit"><b>Audit log</b><span>Every approval and quality decision, with who made it.</span></Link>
            <Link to="/tower"><b>Control tower</b><span>The live picture of stock, transfers and grounded aircraft.</span></Link>
            <Link to="/how-it-works"><b>How Avilo works</b><span>The story, the roles and a five-minute demo.</span></Link>
          </div>
        </Card>
        <Card title="Latest decisions" aside={<Link to="/audit">See all</Link>}>
          <div className="list">
            {recent.map((a, i) => (
              <div className="li" key={i}><div className="grow"><b>{a.action}</b><span className="small muted">{uname(a.by)} · {a.object} · {fDT(a.ts)}</span></div></div>
            ))}
          </div>
        </Card>
      </div>
      <Card title="Demo data">
        <p className="note">Putting the demo back to the start restores the lost pump, the grounded aircraft and the six reorder suggestions, for everyone.</p>
        <div><button className="btn danger" onClick={() => act('reset_demo', {})}>Reset demo data</button></div>
      </Card>
    </>
  )
}
