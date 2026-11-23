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
}

// Keyed by component name so a page shares its help wherever it appears in the menu.
export const PAGE_GUIDE = {
  ControlTower: { what: 'The live picture of the whole network: every station, every part on its way, every problem.', how: ['The globe shows the four stations. Orange lines are parts in transit; a stuck orange dot is a late one.', '“Needs attention” lists what someone has to deal with now.', 'The table at the bottom shows, for each important part, how many are on the shelf against how many there should be. Red means too few.'] },
  Stores: { what: 'Your stores room. Anything waiting for you is under “Work for”.', how: ['“Confirm receipt” when a part from another station arrives. Try it on the overdue hydraulic pump at SIN.', 'Type a part or serial number in the box at the top to find it.', 'Use “Turn in a removed part” when an engineer hands back a broken part, then “Send for repair” under Repairs.', 'The RFID gate box stands in for the reader on the dock door: read a tag at goods-in to confirm a transfer automatically.'] },
  FindPart: { what: 'Find any part in the network and see where it fits on the aircraft.', how: ['Pick a part on the right; the aircraft lights up where it is fitted.', '“Where it is” shows how many each station has, and any on their way.', 'Raise a request. Choose AOG if the aircraft cannot fly: Avilo reserves the nearest part at once.'] },
  Replenishment: { what: 'Avilo suggests what to reorder. People decide.', how: ['Each card says why it was suggested: expected demand, stock on hand, and how long the supplier takes.', 'Each card shows who must approve it. Under USD 5,000: the Planner (A. Mensah) alone. USD 5,000 or more: the Planner first, then the Procurement Manager (S. Weber).', 'If another station has spare stock, “Transfer instead” moves it rather than buying more.'] },
  Forecasts: { what: 'How much of each part Avilo expects to be used, and how it decides when to reorder.', how: ['Pick a part and station. Grey bars are past weekly use; the blue line is the forecast.', '“Method comparison” shows which forecasting method was most accurate for that part.', '“Reorder point” compares the old formula with Avilo’s.'] },
  Quality: { what: 'Parts cannot be used until their certificate is checked here.', how: ['“Verify” makes a delivered part usable.', '“Reject” quarantines it so nobody can fit it.', 'Quarantined parts can be released after a re-check, or scrapped.'] },
  SupplierOrders: { what: 'Orders the airline has sent to your company.', how: ['Confirm new orders with the date you can deliver, or decline them. The planner is told straight away (the bell, top right).', 'Upload the certificate, then mark the order shipped.', 'Your on-time score is worked out from your past deliveries.'] },
  PartHistory: { what: 'The full life story of one part, from delivery to today.', how: ['Type a serial or batch number, or pick one of the examples.', 'Each line is one event: who did it, when, and where.', 'Nothing here can be edited. Mistakes are fixed by adding a new event.'] },
  SimulationLab: { what: 'Evidence for the project: the same year replayed three ways.', how: ['A is today’s reorder point with weekly records; B adds real-time tracking; C adds maintenance-informed forecasting too.', 'Fewer critical stockouts is better.', 'Switch between the four scenarios (normal year, AOG spike, delayed supplier, lost transfer) to see how each policy copes.'] },
  AuditLog: { what: 'A record of every decision: approvals, quality checks, limit changes.', how: ['Filter by a name or a word.', 'Entries can never be changed or deleted, not even by the Super Admin.'] },
  UsersLimits: { what: 'Who uses Avilo, what they may do, and the approval limit.', how: ['Accounts: the Admin requests an account; Planner, Procurement, Compliance and Admin accounts wait for the Procurement Manager to approve; then the Admin presses “Create account” and passes on the one-time password.', 'The approval limit decides when an order needs a second approval.', 'Changing it needs two people: the Admin proposes, the Procurement Manager agrees.', 'The table at the bottom shows what each role may do.'] },
  Overview: { what: 'Your starting point: the state of the system and where to go next.', how: ['Each card links to the page that deals with it.', 'Open “How Avilo works” for the full story and a guided demo.'] },
  ErpImport: { what: 'Compare the ERP’s stock figures with what Avilo’s ledger says is on the shelf.', how: ['Choose a stock extract from the ERP (CSV) or paste it, then Import.', 'The table lists every part and station where the two disagree.', '“Download ledger in ERP format” gives you a file in the same layout, to try the import.'] },
  LeadTimes: { what: 'How long orders really take, step by step, and how late each supplier tends to be.', how: ['“By supplier” shows actual ÷ quoted lead time. Avilo plans with this, so a supplier who is usually late gets more cover.', '“Orders” breaks each order into approval, supplier confirmation, supply and inspection.', 'Export CSV for the time-to-replenish evidence.'] },
  VisibilityTest: { what: 'The H1 evidence: speed of updates, and whether planted problems are caught.', how: ['Run the latency test: it sends test movements and times how long each takes to reach this screen.', 'Plant discrepancies: Avilo is scored on lost transfers, ERP mismatches and gate exceptions.', 'Export both results, then reset the demo data on the Overview.'] },
  H3Session: { what: 'The timer screen for the H3 volunteer session: manual method against Avilo, order by order.', how: ['Name the session, choose the method and the order set.', 'Press Start as you hand over each card. In the manual method, press each step as it is finished; in Avilo the steps are recorded automatically.', 'Results compares the two methods pair by pair against the 30% rule. Export both CSV files at the end.'] },
  HowItWorks: { what: 'Your role, and a checklist of things to try in Avilo.', how: ['“Go there” opens the right page for each step.', 'Tick a step when you have done it; ticks are remembered in this browser.'] },
}

// What to try, role by role: each step says what to do, where, and what should happen.
// `go` is the page to open. `station`-specific wording uses the signed-in person's stations.
export const ROLE_STEPS = {
  planner: [
    { go: '/', do: 'Open the Control tower and read “Needs attention”.', see: 'Late transfers, including hydraulic pump HP-10482, and a grounded aircraft: AVL-04 in Singapore, waiting for a brake.' },
    { go: '/history?id=HP-10482', do: 'Open the history of hydraulic pump HP-10482.', see: 'It left London two months ago and nobody in Singapore ever confirmed it arrived.' },
    { go: '/replenishment', do: 'Open Replenishment. Each card is a reorder Avilo suggests, with the reason.', see: 'A list of suggestions. The one with a red edge is for the grounded aircraft.' },
    { go: '/replenishment', do: 'On the brake card for SIN, press “Transfer from DXB instead”.', see: 'Nothing is bought. Dubai stores get a task to send a spare brake to Singapore.' },
    { go: '/replenishment', do: 'Approve the engine oil filter elements for LHR (under USD 5,000).', see: 'You are the only approval needed: a purchase order goes straight to the supplier, who is notified at once.' },
    { go: '/replenishment', do: 'Approve the air data computer for LHR (USD 5,000 or more).', see: 'Step 1 is done. It now waits for the Procurement Manager, S. Weber, to give step 2.' },
    { go: '/find', do: 'In Find a part, pick any part and raise a request for an aircraft.', see: 'The request appears in the list and in the Control tower.' },
    { go: '/lead-times', do: 'Open Supplier lead times.', see: 'How late each supplier usually is. Avilo plans with that, so the reorder points already allow for it.' },
    { go: '/erp', do: 'Open ERP reconciliation.', see: 'Last week’s ERP extract against the ledger: engine oil at LHR and tyres at SIN do not match.' },
  ],
  operator: [
    { go: '/', do: 'Open Stores and look at “Work for {station}”.', see: 'Everything waiting for you: parts arriving, deliveries, transfers to send, parts to hand out.' },
    { go: '/', do: 'Press “Confirm receipt” on a part that has arrived from another station.', see: 'It becomes stock at your station, and the late alert disappears for everyone. In Singapore, try it on hydraulic pump HP-10482.' },
    { go: '/', do: 'Press “Receive” on a supplier delivery, if one is waiting.', see: 'The parts arrive as “Pending inspection” until Compliance checks the certificate.' },
    { go: '/', do: 'Type a part or serial number in the box at the top, for example 3214552-3, and press Look up.', see: 'Every matching part, where it is, and its condition. Serviceable parts at your station can be sent to another station.' },
    { go: '/', do: 'Under “Turn in a removed part”, enter a serial number and press “Record as unserviceable”.', see: 'The broken part is now on record at your station, ready to go for repair.' },
    { go: '/', do: 'Under Repairs, press “Send for repair” on it.', see: 'A repair order number is given and the part leaves your stock until it comes back.' },
    { go: '/', do: 'In the RFID gate box, choose Goods in and read the tag of a part on its way to you.', see: 'The gate confirms the transfer by itself. A tag the ledger does not expect becomes an exception under “Work for”.' },
  ],
  technician: [
    { go: '/', do: 'In Find a part, pick “Brake assembly, main wheel” on the right.', see: 'The aircraft shows the main landing gear. “Where it is” shows no brake in Singapore, but spares in Dubai.' },
    { go: '/', do: 'Pick other parts and watch the aircraft.', see: 'The marker moves to where each part is fitted: engines, avionics bay, tail.' },
    { go: '/', do: 'Under “Request this part”, choose an aircraft, keep “Routine”, and press “Raise request”.', see: 'Your request appears under “Part requests”, and the planner sees it.' },
    { go: '/', do: 'Raise another request with priority “AOG”.', see: 'Avilo reserves the nearest serviceable part at once, and sends a transfer task if it is at another station.' },
  ],
  procurement: [
    { go: '/', do: 'Open Replenishment. Cards of USD 5,000 or more show two approval steps.', see: 'Step 1 is the Planner (A. Mensah). Until it is done, your Approve button stays locked.' },
    { go: '/', do: 'When a card shows step 1 done, press Approve.', see: 'You give step 2. The purchase order goes to the supplier and appears under “Purchase orders in flight”.' },
    { go: '/', do: 'Scroll to “Supplier scorecards”.', see: 'How often each supplier delivers on time, and how long they take.' },
    { go: '/lead-times', do: 'Open Supplier lead times and export the CSV.', see: 'Every order broken into approval, supplier confirmation, supply and inspection: the time-to-replenish evidence.' },
    { go: '/access', do: 'In Users & limits, approve or reject a change to the approval limit, if the Admin has proposed one.', see: 'The limit only changes once you agree.' },
  ],
  compliance: [
    { go: '/', do: 'Open Quality. Under “Certificates to verify” is air data computer AD-55102.', see: 'It cannot be used until you decide.' },
    { go: '/', do: 'Press Verify.', see: 'The part becomes Serviceable and can be fitted.' },
    { go: '/', do: 'Under “Quarantined and blocked”, look at fuel pump FP-10420.', see: 'Its certificate did not match. Release it after a re-check, or scrap it.' },
    { go: '/audit', do: 'Open the Audit log.', see: 'Every decision you just made, with your name and the time.' },
  ],
  supplier: [
    { go: '/', do: 'Open My orders. Find PO-7004 (landing light lamps).', see: 'A new order from the airline, waiting for your answer.' },
    { go: '/', do: 'Choose the date you can deliver and press “Confirm order”.', see: 'The planner is notified with your promised date and can count on it.' },
    { go: '/', do: 'On PO-7001, press “Upload Form 1”, then “Mark shipped”.', see: 'The airline’s stores can now receive it, and Compliance will check your certificate.' },
    { go: '/', do: 'Look at the scores at the top.', see: 'Your on-time rate and average lead time, worked out from past deliveries.' },
  ],
  admin: [
    { go: '/', do: 'Read the Overview.', see: 'How many people use Avilo, the stations, the approval limit and any problems right now.' },
    { go: '/access', do: 'In Users & limits, check the people list.', see: 'Each person’s role and which stations they can work at.' },
    { go: '/access', do: 'Propose a new approval limit, for example 10,000.', see: 'It does not change yet. The Procurement Manager has to agree.' },
    { go: '/audit', do: 'Open the Audit log.', see: 'Your proposal is recorded with your name.' },
    { go: '/visibility-test', do: 'Open Visibility test and run both tests.', see: 'How fast stock changes reach the screen, and whether every planted problem is caught.' },
    { go: '/', do: 'When you have finished testing, press “Reset demo data” on the Overview.', see: 'Everything goes back to the starting story, for everyone.' },
  ],
  superadmin: [
    { go: '/', do: 'Read the Overview.', see: 'The state of the whole system at a glance.' },
    { go: '/audit', do: 'Open the Audit log and filter by a name.', see: 'Every decision anyone has made. You can read it but never change it.' },
    { go: '/tower', do: 'Open the Control tower.', see: 'The same live picture the planner sees, so you can help them.' },
    { go: '/visibility-test', do: 'Open Visibility test and run the latency test.', see: 'Each test movement timed from the server to this screen, with the mean against the 5-second target.' },
    { go: '/', do: 'Press “Reset demo data” on the Overview when you need a clean start.', see: 'Everything goes back to the starting story, for everyone.' },
  ],
}
