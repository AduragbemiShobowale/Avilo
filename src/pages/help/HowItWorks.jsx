import { useAuth } from '../../context/AuthContext'
import { ROLE_GUIDE, DEMO_STEPS } from '../../lib/guide'
import { ROLE_LABEL } from '../../lib/format'
import { PageHead, Card } from '../../components/ui'

// The whole system explained in plain words, with a guided demo.
export default function HowItWorks() {
  const { role } = useAuth()
  return (
    <>
      <PageHead title="How Avilo works" sub="What the system is for, who does what, and a five-minute demo to try." />
      <div className="grid g3 top">
        <Card title="1 · The problem">
          <p>A hydraulic pump was sent from London to Singapore for an emergency and never checked in. The spreadsheet still says London has one. When the London hangar needs it, the shelf is empty and the aircraft waits on the ground.</p>
        </Card>
        <Card title="2 · What Avilo does">
          <p>Every time a part is received, moved, issued or checked, it is recorded the moment it happens. So Avilo always knows where each part is, including parts on a truck or a plane between stations.</p>
        </Card>
        <Card title="3 · Then it helps plan">
          <p>From what has been used before, Avilo predicts what each station will need and suggests reorders. People approve them, and suppliers confirm and ship in their own portal.</p>
        </Card>
      </div>

      <Card title="Who does what">
        <div className="roles-grid">
          {Object.entries(ROLE_GUIDE).map(([r, g]) => (
            <div key={r} className={`role-card ${r === role ? 'me' : ''}`}>
              <b>{ROLE_LABEL[r]}{r === role ? ' · you' : ''}</b>
              <p className="muted">{g.who}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Try it: a five-minute demo" aside="Use the logins your project team holds. Open each step in its own browser window to see the screens update live.">
        <ol className="demo">
          {DEMO_STEPS.map((s, i) => (
            <li key={i}>
              <span className="n">{i + 1}</span>
              <div><b>{s.who}</b> <span className="mono small muted">{s.login}</span><p>{s.do}</p></div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Words you will see">
        <dl className="glossary">
          <dt>AOG</dt><dd>Aircraft on ground: the aircraft cannot fly until a part arrives. Always the most urgent.</dd>
          <dt>P/N and S/N</dt><dd>Part number (what kind of part) and serial number (this exact one).</dd>
          <dt>In transit / Overdue</dt><dd>On its way between stations. Overdue means nobody confirmed it arrived within 72 hours.</dd>
          <dt>Serviceable</dt><dd>Checked, certified and safe to fit on an aircraft.</dd>
          <dt>Reorder point</dt><dd>When stock falls to this number, Avilo suggests ordering more.</dd>
          <dt>Approval limit</dt><dd>Orders at or above this value need two people to approve them.</dd>
          <dt>Form 1 / 8130-3</dt><dd>The safety certificate that comes with every aircraft part.</dd>
        </dl>
      </Card>
    </>
  )
}
