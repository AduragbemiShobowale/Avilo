# Avilo

**Aviation logistics, without the blind spots.**

Avilo is the capstone prototype for *Optimizing Aircraft Spares and Components Supply Chains Through a Digital Inventory Visibility and Replenishment Framework*. It is a spares control tower with role-based screens, an append-only stock ledger, forecasting, approvals, a supplier portal and a simulation lab.

All stations, people, suppliers, part numbers and demand are **fictional and simulated**.

## What it does

| Area | What you can do |
|---|---|
| Control tower | 3D globe of stations, transfers and supplier orders; overdue alerts; stock against reorder point; live ledger feed |
| Stores | Scan or type a part, confirm transfer receipts, send transfers, receive deliveries, issue reserved parts, turn in removed parts, send rotables for repair and receive them back, simulated RFID goods-in/goods-out gate with exceptions |
| Find a part | Search every station and in-transit stock; 3D aircraft shows where the part is fitted; raise routine or AOG requests |
| Replenishment | Recommendations with their reason, approval path and lateral-transfer alternative; purchase orders; supplier scorecards |
| Forecasts | Demand pattern (Syntetos–Boylan), matching method (SES, SBA or TSB), planned check consumption from the check calendar; classic reorder point next to Avilo's |
| Supplier lead times | Each order as a timeline (approval, supplier confirmation, supply, inspection); observed lateness per supplier, which sets the planning lead time; CSV export |
| ERP reconciliation | Import a stock-on-hand extract (Navision/Business Central, AMOS, TRAX, SAP or a spreadsheet) and compare it line by line with the ledger |
| Quality | Verify certificates, quarantine, release or scrap parts |
| Supplier portal | Confirm own orders with a delivery date, decline, upload certificate and ship; notifications both ways |
| Part history | Full event history of any serial or batch |
| Simulation lab | Discrete-event simulation: baseline vs visibility only vs full framework, four scenarios (normal, AOG spike, delayed supplier, lost transfer); `npm run simulate` writes the Chapter 4 results |
| Visibility test | H1 evidence: latency from server write to screen over 200 events, and detection of planted lost transfers, ERP mismatches and gate exceptions |
| Audit log, Users & limits | Append-only decision log; approval limit change needs a second person; permissions matrix |

## Architecture

```
React + Vite on Vercel
  ├─ three.js         3D globe and aircraft
  ├─ lib/engine.js    ledger projection, forecasting, replenishment engine, simulation
  └─ supabase-js ──► Supabase (Postgres + Auth + Realtime)
                       ├─ events        append-only ledger (update/delete blocked by trigger)
                       ├─ items         stock projection, updated by trigger in the same transaction
                       ├─ requests, pos, rec_decisions, tasks, audit, settings
                       ├─ RLS           read policies only; no table accepts direct writes
                       └─ RPC functions every write: checks role, station scope and separation of duties
```

**Where the rules are enforced.** In the database, not the browser. Hiding a button is never the only control. Examples the server refuses:

- A Stores Operator moving stock at a station outside their scope.
- The Procurement Manager giving the second approval before the Planner's first.
- The same person approving twice, or approving an order they raised.
- An Admin approving spend, or changing the approval limit without the Procurement Manager.
- A Supplier reading the ledger or acting on another supplier's order.
- A Compliance Officer verifying a certificate on a part they received.
- Issuing a part that is quarantined, pending inspection, reserved for someone else, or at another station.

Order value and AOG status are recomputed on the server from the part master and open requests; the browser's numbers are never trusted.

## Roles

| Role | Lands on | Can |
|---|---|---|
| Supply Chain Planner | Control tower | Approve below limit and give first approval above it; raise requests; request lateral transfers |
| Stores Operator | Stores | Receive, issue, transfer and count stock at their own stations |
| Technician | Find a part | Search all stations; raise routine and AOG requests for their station |
| Procurement Manager | Replenishment | Second-level approval; approve approval-limit changes |
| Compliance Officer | Quality | Verify certificates; quarantine, release and scrap parts; read the audit log |
| Supplier | My orders | Confirm, decline, upload certificates and ship their own orders |
| Admin | Users & limits | Manage configuration, propose limit changes, import ERP extracts, run the visibility test, reset demo data |
| Super Admin | Audit log | Platform support, read-only across the organisation |

Opening the site plays the Avilo intro (the logo builds itself, once per browser session), then the sign-in screen: a live 3D hangar at night where the doors roll open, the floodlights come on and a scanner finds the lost pump on the racks. Sign-in is e-mail and password only, with "Forgot your password?". There is no public sign-up: accounts are created for people, as in an airline or MRO. **Demo logins are not in this repository**; the project team holds them.

## Project structure

```
src/
  main.jsx, App.jsx           routing: public landing and sign-in, then one menu per role
  context/AuthContext.jsx     session and the signed-in person's profile
  context/LiveContext.jsx     everything the role may read, kept current by Supabase realtime
  lib/engine.js               ledger projection, forecasting, replenishment engine, simulation
  lib/model.js                stations, suppliers, fleet, part master, demand history
  lib/scenes.js               three.js network globe and aircraft parts locator
  lib/hangar.js               three.js hangar scene behind the sign-in screen
  lib/aircraft.js             the aircraft model shared by all 3D scenes
  components/Intro.jsx        the logo loading sequence
  components/                 layout, UI parts, 3D wrappers, icons, logo
  pages/screens/registry.jsx  every screen by role; menus and routes come from it
  pages/...                   one folder per area (tower, stores, find, plan, quality, supplier, history, lab, admin, auth)
supabase/migrations           schema, server functions, seed, grants
supabase/tests/access_test.sql  role and separation-of-duties checks (rolls back)
tests/                        engine unit tests (npm test)
brand/                        logo files
```

## Run it locally

```bash
npm install
npm run dev
```

It connects to the hosted Supabase project by default. To use another project, copy `.env.example` to `.env.local` and fill it in. The anon key is public by design; row-level security and the server functions protect the data.

`npm test` runs the engine tests. Paste `supabase/tests/access_test.sql` into the Supabase SQL editor to check the access rules; every row should say PASS.

## Set up your own database

1. Create a Supabase project.
2. Run the files in `supabase/migrations` in order.
3. Create users in Supabase Auth and add a row for each in `public.profiles` (`handle`, `name`, `role`, `scope`, `supplier`). The seed uses handles `u-pl`, `u-op1`, `u-op2`, `u-op3`, `u-te`, `u-pm`, `u-co`, `u-su`, `u-ad`, `u-sa`.
4. Run `select public.seed_demo();`.
5. Put your project URL and anon key in `.env.local`.

Signed in as Admin, **Reset demo data** in the sidebar restores the starting scenario at any time.

## Limits

- Simulated data only. Results from the simulation lab test the design; they are not measured savings.
- The demo accounts share one public link, so anyone with a password can change demo data. Reset it before the defence.
- 3D, fonts and the Supabase client load from public CDNs; without internet the 3D views show a fallback message.
- Not a certified aviation system. It models the traceability authorities expect but claims no regulatory approval.
