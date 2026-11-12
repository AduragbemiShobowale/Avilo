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
  tower: { path: '/', label: 'Control tower', icon: 'radar', group: 'Operate', component: ControlTower, count: overdue },
  stores: { path: '/', label: 'Stores', icon: 'box', group: 'Operate', component: Stores, count: storeWork },
  find: { path: '/find', label: 'Find a part', icon: 'search', group: 'Operate', component: FindPart, count: openReqs },
  findHome: { path: '/', label: 'Find a part', icon: 'search', group: 'Operate', component: FindPart, count: openReqs },
  replen: { path: '/replenishment', label: 'Replenishment', icon: 'loop', group: 'Plan', component: Replenishment, count: openRecs },
  replenHome: { path: '/', label: 'Replenishment', icon: 'loop', group: 'Plan', component: Replenishment, count: openRecs },
  forecast: { path: '/forecasts', label: 'Forecasts', icon: 'chart', group: 'Plan', component: Forecasts },
  quality: { path: '/', label: 'Quality', icon: 'shield', group: 'Control', component: Quality, count: pendingCerts },
  orders: { path: '/', label: 'My orders', icon: 'truck', group: 'Supplier', component: SupplierOrders, count: myOrders },
  history: { path: '/history', label: 'Part history', icon: 'clock', group: 'Control', component: PartHistory },
  towerView: { path: '/tower', label: 'Control tower', icon: 'radar', group: 'Operate', component: ControlTower, count: overdue },
  lab: { path: '/lab', label: 'Simulation lab', icon: 'flask', group: 'Evidence', component: SimulationLab },
  audit: { path: '/audit', label: 'Audit log', icon: 'list', group: 'Control', component: AuditLog },
  auditHome: { path: '/', label: 'Audit log', icon: 'list', group: 'Control', component: AuditLog },
  access: { path: '/access', label: 'Users & limits', icon: 'users', group: 'Control', component: UsersLimits },
  accessHome: { path: '/', label: 'Users & limits', icon: 'users', group: 'Control', component: UsersLimits },
}

// Every screen, by role. Routes and menus are generated from this list.
export const SCREENS = {
  planner: [S_.tower, S_.find, S_.replen, S_.forecast, S_.history, S_.lab],
  operator: [S_.stores, S_.find, S_.history],
  technician: [S_.findHome, S_.history],
  procurement: [S_.replenHome, S_.towerView, S_.forecast, S_.find, S_.history, S_.access, S_.lab],
  compliance: [S_.quality, S_.towerView, S_.find, S_.history, S_.audit],
  supplier: [S_.orders],
  admin: [S_.accessHome, S_.towerView, S_.find, S_.history, S_.audit, S_.lab],
  superadmin: [S_.auditHome, S_.towerView, S_.find, S_.history, S_.access, S_.lab],
  viewer: [S_.tower, S_.forecast, S_.history, S_.lab],
}
