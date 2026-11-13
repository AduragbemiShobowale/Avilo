// Plain-language help. Every role and every page says what it is for and what to try first.

export const ROLE_GUIDE = {
  planner: {
    who: 'You keep the right parts at the right stations.',
    does: ['Watch the control tower for late transfers and grounded aircraft', 'Approve reorders below USD 5,000, and give the first approval on bigger ones', 'Send spare stock from one station to another instead of buying more'],
    cannot: ['Approve an order you raised yourself', 'Give the second approval on orders of USD 5,000 or more'],
  },
  operator: {
    who: 'You run a stores room: every part in or out goes through you.',
    does: ['Confirm parts that arrive from other stations', 'Receive deliveries from suppliers', 'Hand parts to engineers for an aircraft', 'Send parts to another station'],
    cannot: ['Move stock at a station you are not assigned to', 'Approve orders or certify parts'],
  },
  technician: {
    who: 'You fix aircraft and need to find parts fast.',
    does: ['Search every station for a part, including parts on their way', 'See where the part fits on the aircraft', 'Ask for a part, or raise an urgent AOG request when an aircraft is grounded'],
    cannot: ['Take parts out of stores yourself', 'Approve orders'],
  },
  procurement: {
    who: 'You approve the expensive orders and look after suppliers.',
    does: ['Give the second approval on orders of USD 5,000 or more', 'See how reliable each supplier is', 'Approve or reject a change to the approval limit'],
    cannot: ['Approve before the planner has approved', 'Approve the same order twice'],
  },
  compliance: {
    who: 'You decide whether a part is safe to fit on an aircraft.',
    does: ['Check the certificate that comes with each delivered part', 'Quarantine a doubtful part so nobody can use it', 'Release or scrap quarantined parts', 'Read the audit log'],
    cannot: ['Order parts', 'Approve a certificate on a part you received yourself'],
  },
  supplier: {
    who: 'You sell parts to the airline.',
    does: ['See the orders sent to your company', 'Accept or decline an order', 'Upload the part certificate and mark the order shipped'],
    cannot: ['See the airline’s stock, prices or other suppliers'],
  },
  admin: {
    who: 'You run the system for your organisation.',
    does: ['See everyone who uses Avilo and what they may do', 'Propose a new approval limit (the Procurement Manager must agree)', 'Read the audit log', 'Reset the demo data to the starting story'],
    cannot: ['Approve spending', 'Change the approval limit on your own'],
  },
  superadmin: {
    who: 'You are Avilo’s own support team, looking in to help.',
    does: ['Look at any screen to help a customer', 'Read the audit log of every decision', 'Reset the demo data'],
    cannot: ['Approve spending, move stock or certify parts', 'Act for anyone else; everything you do is recorded'],
  },
  viewer: {
    who: 'You are management: you watch, you do not act.',
    does: ['See stock value, late transfers and grounded aircraft', 'Look at forecasts and the simulation results'],
    cannot: ['Change anything'],
  },
}

// Keyed by component name so a page shares its help wherever it appears in the menu.
export const PAGE_GUIDE = {
  ControlTower: { what: 'The live picture of the whole network: every station, every part on its way, every problem.', how: ['The globe shows the four stations. Orange lines are parts in transit; a stuck orange dot is a late one.', '“Needs attention” lists what someone has to deal with now.', 'The table at the bottom shows, for each important part, how many are on the shelf against how many there should be. Red means too few.'] },
  Stores: { what: 'Your stores room. Anything waiting for you is under “Work for”.', how: ['“Confirm receipt” when a part from another station arrives. Try it on the overdue hydraulic pump at SIN.', 'Type a part or serial number in the box at the top to find it.', 'Use “Turn in a removed part” when an engineer hands back a broken part.'] },
  FindPart: { what: 'Find any part in the network and see where it fits on the aircraft.', how: ['Pick a part on the right; the aircraft lights up where it is fitted.', '“Where it is” shows how many each station has, and any on their way.', 'Raise a request. Choose AOG if the aircraft cannot fly: Avilo reserves the nearest part at once.'] },
  Replenishment: { what: 'Avilo suggests what to reorder. People decide.', how: ['Each card says why it was suggested: expected demand, stock on hand, and how long the supplier takes.', 'Approve or reject. Orders of USD 5,000 or more need the planner first, then the Procurement Manager.', 'If another station has spare stock, “Transfer instead” moves it rather than buying more.'] },
  Forecasts: { what: 'How much of each part Avilo expects to be used, and how it decides when to reorder.', how: ['Pick a part and station. Grey bars are past weekly use; the blue line is the forecast.', '“Method comparison” shows which forecasting method was most accurate for that part.', '“Reorder point” compares the old formula with Avilo’s.'] },
  Quality: { what: 'Parts cannot be used until their certificate is checked here.', how: ['“Verify” makes a delivered part usable.', '“Reject” quarantines it so nobody can fit it.', 'Quarantined parts can be released after a re-check, or scrapped.'] },
  SupplierOrders: { what: 'Orders the airline has sent to your company.', how: ['Accept or decline new orders.', 'Upload the certificate, then mark the order shipped.', 'Your on-time score is worked out from your past deliveries.'] },
  PartHistory: { what: 'The full life story of one part, from delivery to today.', how: ['Type a serial or batch number, or pick one of the examples.', 'Each line is one event: who did it, when, and where.', 'Nothing here can be edited. Mistakes are fixed by adding a new event.'] },
  SimulationLab: { what: 'Evidence for the project: the same year replayed three ways.', how: ['A is today’s weekly spreadsheet; B adds real-time tracking; C adds forecasting too.', 'Fewer critical stockouts is better.', 'Switch to “Utilisation +30%” to see what happens when demand grows.'] },
  AuditLog: { what: 'A record of every decision: approvals, quality checks, limit changes.', how: ['Filter by a name or a word.', 'Entries can never be changed or deleted, not even by the Super Admin.'] },
  UsersLimits: { what: 'Who uses Avilo, what they may do, and the approval limit.', how: ['The approval limit decides when an order needs a second approval.', 'Changing it needs two people: the Admin proposes, the Procurement Manager agrees.', 'The table at the bottom shows what each role may do.'] },
  Overview: { what: 'Your starting point: the state of the system and where to go next.', how: ['Each card links to the page that deals with it.', 'Open “How Avilo works” for the full story and a guided demo.'] },
  HowItWorks: { what: 'What Avilo is, who does what, and a five-minute demo to try.', how: ['Read the story first, then follow the demo steps with the logins your team holds.'] },
}

// The guided demo, in the order a panel would see it.
export const DEMO_STEPS = [
  { who: 'Supply Chain Planner', login: 'planner@avilo.test', do: 'Open the Control tower. Two transfers are late. One is hydraulic pump HP-10482, sent to Singapore two months ago and never checked in.' },
  { who: 'Stores Operator, Singapore', login: 'stores.sin@avilo.test', do: 'In Stores, press “Confirm receipt” on the pump. The pump is found.' },
  { who: 'Supply Chain Planner', login: 'planner@avilo.test', do: 'Back in the Control tower, the alert has gone. Everyone sees the change at once.' },
  { who: 'Technician, Singapore', login: 'technician@avilo.test', do: 'In Find a part, pick the brake assembly. Aircraft AVL-04 is grounded (AOG) waiting for it.' },
  { who: 'Supply Chain Planner', login: 'planner@avilo.test', do: 'In Replenishment, on the brake card, press “Transfer from DXB instead”. Dubai has spares, so nothing is bought.' },
  { who: 'Stores Operator, London and Dubai', login: 'stores.lhr@avilo.test', do: 'Switch to DXB in Stores and press “Send transfer”. The brake is on its way to Singapore.' },
  { who: 'Supply Chain Planner, then Procurement Manager', login: 'planner@avilo.test, then procurement@avilo.test', do: 'Approve the air data computer reorder. It costs more than USD 5,000, so the planner approves first, then the Procurement Manager.' },
  { who: 'Supplier', login: 'supplier@avilo.test', do: 'In My orders, accept an order, upload the certificate and mark it shipped.' },
  { who: 'Admin', login: 'admin@avilo.test', do: 'In Users & limits, press “Reset demo data” to put the story back to the start.' },
]
