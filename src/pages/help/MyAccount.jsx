import { useAuth } from '../../context/AuthContext'
import { ROLE_GUIDE } from '../../lib/guide'
import { ROLE_LABEL } from '../../lib/format'
import AV from '../../lib/engine'
import { PageHead, Card } from '../../components/ui'
import { SetPassword } from '../auth/AuthPages'

// Who you are in Avilo, what your role lets you do, and your password.
export default function MyAccount() {
  const { profile, role } = useAuth()
  const g = ROLE_GUIDE[role]
  const stations = profile.scope?.length === 4 ? 'All four stations' : profile.scope?.length ? profile.scope.map((c) => `${c} · ${AV.stations.find((s) => s.code === c)?.name}`).join(', ') : 'None: you see only your own orders'
  return (
    <>
      <PageHead title="My account" sub="Who you are in Avilo and what your role lets you do." />
      <div className="grid g2 top">
        <Card title="Your details">
          <dl className="facts">
            <dt>Name</dt><dd>{profile.name}</dd>
            <dt>E-mail</dt><dd className="mono">{profile.email}</dd>
            <dt>Role</dt><dd>{ROLE_LABEL[role]}</dd>
            <dt>Stations</dt><dd>{stations}</dd>
            {profile.supplier && <><dt>Company</dt><dd>{AV.supBy[profile.supplier]?.name}</dd></>}
          </dl>
        </Card>
        <Card title="What your role does">
          <p>{g.who}</p>
          <div className="cando">
            <div><span className="label">You can</span><ul>{g.does.map((d) => <li key={d}>{d}</li>)}</ul></div>
            <div><span className="label">You cannot</span><ul className="no">{g.cannot.map((d) => <li key={d}>{d}</li>)}</ul></div>
          </div>
          <p className="note">These limits are enforced by the database, so they hold even if someone bypasses the screens.</p>
        </Card>
      </div>
      <SetPassword inApp />
    </>
  )
}
