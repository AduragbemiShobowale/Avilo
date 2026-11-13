import AV from '../../lib/engine'
import ControlTower from '../tower/ControlTower'
import Stores from '../stores/Stores'
import FindPart from '../find/FindPart'
import Replenishment from '../plan/Replenishment'
import Forecasts from '../plan/Forecasts'
import Quality from '../quality/Quality'
import SupplierOrders from '../supplier/SupplierOrders'
import PartHistory from '../history/PartHistory'
import SimulationLab from '../lab/SimulationLab'
import AuditLog from '../admin/AuditLog'
import UsersLimits from '../admin/UsersLimits'
import Overview from '../help/Overview'
import HowItWorks from '../help/HowItWorks'

// Counts beside menu items, computed from what the signed-in role can read.
const openRecs = (S) => AV.recommend(S).filter((r) => !r.decision || r.decision.status === 'Awaiting second approval').length
const overdue = (S) => AV.transits(S).filter((t) => t.overdue).length
const pendingCerts = (S) => Object.values(S.items).filter((i) => i.cond === 'pending' && i.loc).length
const storeWork = (S, p) => {
  const sc = p?.scope || []
  return AV.transits(S).filter((t) => sc.includes(t.to)).length + S.tasks.filter((t) => t.status === 'Open' && sc.includes(t.from)).length
    + S.pos.filter((o) => o.status === 'Shipped' && sc.includes(o.station)).length
}
const myOrders = (S, p) => S.pos.filter((o) => o.sup === p?.supplier && ['Sent', 'Confirmed'].includes(o.status)).length
const openReqs = (S) => S.requests.filter((r) => r.status === 'Open').length

const S_ = {
  tower: { path: '/', label: 'Control tower', icon: 'radar', group: 'Operate', component: ControlTower, guide: 'ControlTower', count: overdue },
  stores: { path: '/', label: 'Stores', icon: 'box', group: 'Operate', component: Stores, guide: 'Stores', count: storeWork },
  find: { path: '/find', label: 'Find a part', icon: 'search', group: 'Operate', component: FindPart, guide: 'FindPart', count: openReqs },
  findHome: { path: '/', label: 'Find a part', icon: 'search', group: 'Operate', component: FindPart, guide: 'FindPart', count: openReqs },
  replen: { path: '/replenishment', label: 'Replenishment', icon: 'loop', group: 'Plan', component: Replenishment, guide: 'Replenishment', count: openRecs },
  replenHome: { path: '/', label: 'Replenishment', icon: 'loop', group: 'Plan', component: Replenishment, guide: 'Replenishment', count: openRecs },
  forecast: { path: '/forecasts', label: 'Forecasts', icon: 'chart', group: 'Plan', component: Forecasts, guide: 'Forecasts' },
  quality: { path: '/', label: 'Quality', icon: 'shield', group: 'Control', component: Quality, guide: 'Quality', count: pendingCerts },
  orders: { path: '/', label: 'My orders', icon: 'truck', group: 'Supplier', component: SupplierOrders, guide: 'SupplierOrders', count: myOrders },
  history: { path: '/history', label: 'Part history', icon: 'clock', group: 'Control', component: PartHistory, guide: 'PartHistory' },
  towerView: { path: '/tower', label: 'Control tower', icon: 'radar', group: 'Operate', component: ControlTower, guide: 'ControlTower', count: overdue },
  lab: { path: '/lab', label: 'Simulation lab', icon: 'flask', group: 'Evidence', component: SimulationLab, guide: 'SimulationLab' },
  audit: { path: '/audit', label: 'Audit log', icon: 'list', group: 'Control', component: AuditLog, guide: 'AuditLog' },
  access: { path: '/access', label: 'Users & limits', icon: 'users', group: 'Control', component: UsersLimits, guide: 'UsersLimits' },
  overview: { path: '/', label: 'Overview', icon: 'home', group: 'Start', component: Overview, guide: 'Overview' },
  help: { path: '/how-it-works', label: 'How Avilo works', icon: 'help', group: 'Help', component: HowItWorks, guide: 'HowItWorks' },
}

// Every screen, by role. Routes and menus are generated from this list.
export const SCREENS = {
  planner: [S_.tower, S_.find, S_.replen, S_.forecast, S_.history, S_.lab, S_.help],
  operator: [S_.stores, S_.find, S_.history, S_.help],
  technician: [S_.findHome, S_.history, S_.help],
  procurement: [S_.replenHome, S_.towerView, S_.forecast, S_.find, S_.history, S_.access, S_.lab, S_.help],
  compliance: [S_.quality, S_.towerView, S_.find, S_.history, S_.audit, S_.help],
  supplier: [S_.orders, S_.help],
  admin: [S_.overview, S_.access, S_.audit, S_.towerView, S_.find, S_.history, S_.lab, S_.help],
  superadmin: [S_.overview, S_.audit, S_.access, S_.towerView, S_.find, S_.history, S_.lab, S_.help],
  viewer: [S_.tower, S_.forecast, S_.history, S_.lab, S_.help],
}
