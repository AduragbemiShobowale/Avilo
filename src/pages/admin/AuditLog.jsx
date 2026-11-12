import { useState } from 'react'
import AV from '../../lib/engine'
import { useLive } from '../../context/LiveContext'
import { PageHead, Card, Empty, uname } from '../../components/ui'
import { fDT, ROLE_LABEL } from '../../lib/format'

export default function AuditLog() {
  const { S } = useLive()
  const [q, setQ] = useState('')
  const ql = q.toLowerCase()
  const rows = S.audit.slice().sort((a, b) => b.ts - a.ts)
    .filter((a) => !ql || [a.action, a.object, a.detail, uname(a.by)].join(' ').toLowerCase().includes(ql))

  return (
    <>
      <PageHead title="Audit log" sub="Who decided what, and when. Append-only: entries cannot be edited or deleted, including by the Super Admin.">
        <input className="inp auto" placeholder="Filter by person, action or object" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter audit log" />
      </PageHead>
      <Card aside={`${rows.length} entries · stock movements are in the ledger (${S.events.length} events)`}>
        {rows.length ? (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>When</th><th>Who</th><th>Role</th><th>Action</th><th>Object</th><th>Detail</th></tr></thead>
              <tbody>
                {rows.map((a, i) => (
                  <tr key={i}>
                    <td className="small mono nowrap">{fDT(a.ts)}</td><td>{uname(a.by)}</td>
                    <td className="small muted">{AV.userBy[a.by] ? ROLE_LABEL[AV.userBy[a.by].role] : ''}</td>
                    <td>{a.action}</td><td className="mono small">{a.object}</td><td className="small">{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No entries match.</Empty>}
      </Card>
    </>
  )
}
