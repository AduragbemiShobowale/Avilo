/* Avilo UI: shell, role switching, views and actions. */
(function () {
  const AV = window.AV, DAY = AV.DAY;
  let S, user, current = null, cleanup = [], liveOn = false, liveTimer = 0, labCache = {}, pendingLat = {}, unsub = null, reloadT = 0;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const fDate = (t) => { const d = new Date(t); return String(d.getUTCDate()).padStart(2, '0') + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
  const fTime = (t) => { const d = new Date(t); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + 'Z'; };
  const fDT = (t) => fDate(t) + ' ' + fTime(t);
  const usd = (v) => 'USD ' + Math.round(v).toLocaleString('en-US');
  const usdK = (v) => v >= 1e6 ? 'USD ' + (v / 1e6).toFixed(2) + 'M' : v >= 1e4 ? 'USD ' + Math.round(v / 1e3) + 'k' : usd(v);
  const age = (t) => { const h = (AV.clock() - t) / 36e5; return h < 1 ? Math.max(1, Math.round(h * 60)) + ' min' : h < 48 ? Math.round(h) + ' h' : Math.round(h / 24) + ' d'; };
  const part = (pn) => AV.partBy[pn];
  const uname = (id) => (AV.userBy[id] ? AV.userBy[id].name : 'System');
  const urole = (id) => (AV.userBy[id] ? AV.roleNames[AV.userBy[id].role] : '');

  const IC = {
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6.5-6.5"/>',
    box: '<path d="M3 7.5l9-4.5 9 4.5v9l-9 4.5-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    loop: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M20 4v5h-5M4 20v-5h5"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16l4-5 3 3 5-7"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 15h10"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-6"/>'
  };
  const svgI = (k) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + IC[k] + '</svg>';
  const CHIP = {
    serviceable: ['c-ok', '<path d="M3 8.5l3 3 7-7"/>', 'Serviceable'],
    transit: ['c-warn', '<path d="M2 8h11M9 4l4 4-4 4"/>', 'In transit'],
    overdue: ['c-warn', '<path d="M2 8h11M9 4l4 4-4 4"/>', 'Overdue'],
    repairable: ['c-rep', '<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5"/>', 'Repairable'],
    quarantined: ['c-bad', '<circle cx="8" cy="8" r="5.5"/><path d="M4.2 11.8l7.6-7.6"/>', 'Quarantined'],
    aog: ['c-bad', '<circle cx="8" cy="8" r="5.5"/><path d="M4.2 11.8l7.6-7.6"/>', 'AOG'],
    unserviceable: ['c-off', '<path d="M4 4l8 8M12 4l-8 8"/>', 'Unserviceable'],
    pending: ['c-off', '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.5l2 1.5"/>', 'Pending inspection'],
    issued: ['c-loc', '<path d="M2 9l12-5-4 10-2-4z"/>', 'Fitted'],
    scrapped: ['c-off', '<path d="M4 4l8 8M12 4l-8 8"/>', 'Scrapped'],
    reserved: ['c-loc', '<path d="M5 2h6v12l-3-2-3 2z"/>', 'Reserved'],
    routine: ['c-off', '<circle cx="8" cy="8" r="2.5"/>', 'Routine']
  };
  const chip = (k, txt) => { const c = CHIP[k] || CHIP.routine; return '<span class="chip ' + c[0] + '"><svg viewBox="0 0 16 16">' + c[1] + '</svg>' + esc(txt || c[2]) + '</span>'; };
  const itemChip = (it) => it.transit ? chip(AV.isOverdue(it.transit) ? 'overdue' : 'transit', AV.isOverdue(it.transit) ? 'Overdue ' + age(it.transit.ts) : 'In transit') : chip(it.cond);

  const LOGO = '<svg viewBox="0 0 252 66" role="img" aria-label="Avilo"><g fill="none" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(0 2)"><path d="M10 55 L32 9 L54 55"/><circle cx="32" cy="43" r="6.4" fill="#1B96D2" stroke="none"/></g><g transform="translate(86 0)"><circle cx="22" cy="40" r="15.5"/><path d="M37.5 24.5 V55.5"/><path d="M55 24.5 L68 55.5 L81 24.5"/><path d="M95 24.5 V55.5"/><path d="M110 4.5 V55.5"/><circle cx="140" cy="40" r="15.5"/><circle cx="95" cy="6" r="6.2" fill="#1B96D2" stroke="none"/></g></g></svg>';

  const ROUTES = [
    { id: 'tower', label: 'Control tower', icon: 'radar', cap: 'tower.view', grp: 'Operate' },
    { id: 'stores', label: 'Stores', icon: 'box', cap: 'stores.use', grp: 'Operate' },
    { id: 'find', label: 'Find a part', icon: 'search', cap: 'search', grp: 'Operate' },
    { id: 'replenish', label: 'Replenishment', icon: 'loop', cap: 'replen.view', grp: 'Plan' },
    { id: 'forecast', label: 'Forecasts', icon: 'chart', cap: 'forecast.view', grp: 'Plan' },
    { id: 'quality', label: 'Quality', icon: 'shield', cap: 'compliance.use', grp: 'Control' },
    { id: 'portal', label: 'My orders', icon: 'truck', cap: 'supplier.portal', grp: 'Supplier' },
    { id: 'history', label: 'Part history', icon: 'clock', cap: 'history.view', grp: 'Control' },
    { id: 'lab', label: 'Simulation lab', icon: 'flask', cap: 'sim.view', grp: 'Evidence' },
    { id: 'audit', label: 'Audit log', icon: 'list', cap: 'audit.view', grp: 'Control' },
    { id: 'access', label: 'Users & limits', icon: 'users', cap: 'admin.use', grp: 'Control' }
  ];
  const HOME = { planner: 'tower', operator: 'stores', technician: 'find', procurement: 'replenish', compliance: 'quality', supplier: 'portal', admin: 'access', superadmin: 'audit', viewer: 'tower' };
  const allowed = (id) => { const r = ROUTES.find(x => x.id === id); return r && AV.can(user, r.cap); };

  function toast(msg, err) {
    const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.setAttribute('role', 'status');
    t.innerHTML = '<span class="d"></span><span>' + esc(msg) + '</span>';
    $('#toast').appendChild(t); setTimeout(() => t.remove(), err ? 6500 : 4200);
  }
  async function call(fn, args, okMsg) {
    try {
      const r = await AV.api.rpc(fn, args);
      toast(okMsg || (typeof r === 'string' ? r : 'Done.'));
      await reload(); render();
      return true;
    } catch (e) { toast(e.message, true); return false; }
  }
  async function reload() { const lat = S && S.lastLatencies; S = await AV.api.load(user.id); if (lat) S.lastLatencies = lat; if (S.me) user = S.me; }

  /* ---------- shell ---------- */
  function shell() {
    $('#root').innerHTML = '<div class="app"><header class="top"><a class="brand" href="#' + HOME[user.role] + '">' + LOGO + '<span class="sub">Spares control tower</span></a><span class="spacer"></span>' +
      '<span class="pill" title="Everything in this demo is simulated data">Demo data · simulated</span>' +
      '<span class="pill clock mono" id="clk"></span>' +
      (user.role === 'supplier' ? '' : '<button class="pill ' + (liveOn ? 'live' : 'paused') + '" id="liveBtn" type="button" title="Scanner simulator posts stock movements through the same ingestion door as real scanners"><span class="dot"></span><span>' + (liveOn ? 'Scanner feed live' : 'Scanner feed paused') + '</span></button>') +
      '<span class="who"><span class="lbl">Signed in as</span><b>' + esc(user.name) + '</b><span class="lbl">' + esc(AV.roleNames[user.role]) + (user.scope.length && user.role !== 'supplier' ? ' · ' + user.scope.join(', ') : '') + '</span><button class="pill" type="button" data-act="signout">Sign out</button></span></header>' +
      '<nav class="side" id="nav" aria-label="Sections"></nav><main id="view"></main></div>';
    if ($('#liveBtn')) $('#liveBtn').addEventListener('click', () => { liveOn = !liveOn; const b = $('#liveBtn'); b.className = 'pill ' + (liveOn ? 'live' : 'paused'); b.lastChild.textContent = liveOn ? 'Scanner feed live' : 'Scanner feed paused'; });
    nav();
  }
  function nav() {
    let html = '', grp = '';
    for (const r of ROUTES) {
      if (!AV.can(user, r.cap)) continue;
      if (r.grp !== grp) { grp = r.grp; html += '<div class="grp label">' + grp + '</div>'; }
      html += '<a href="#' + r.id + '"' + (r.id === current ? ' aria-current="page"' : '') + '>' + svgI(r.icon) + '<span>' + r.label + '</span></a>';
    }
    html += '<div class="foot"><span class="small muted">Role: ' + esc(AV.roleNames[user.role]) + '</span>' + (['admin', 'superadmin'].includes(user.role) ? '<button type="button" data-act="reset">Reset demo data</button>' : '') + '</div>';
    $('#nav').innerHTML = html;
  }
  function go(id, force) {
    if (!allowed(id)) id = HOME[user.role];
    if (id === current && !force) return render();
    current = id;
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    nav(); render();
    window.scrollTo(0, 0);
  }
  function render() {
    cleanup.forEach(f => { try { f(); } catch (e) {} }); cleanup = [];
    const el = $('#view');
    VIEWS[current](el);
  }
  const head = (title, sub, right) => '<div class="head"><div class="t"><h1>' + esc(title) + '</h1>' + (sub ? '<p class="muted">' + sub + '</p>' : '') + '</div>' + (right || '') + '</div>';

  /* ---------- shared computations ---------- */
  function stationShort(code) {
    let n = 0;
    for (const p of AV.parts) if (p.crit !== 'C' && AV.available(S, p.pn, code) < AV.ropFor(p.pn, code).avilo) n++;
    return n;
  }
  function globeData() {
    const transits = AV.transits(S);
    const pos = S.pos.filter(o => ['Sent', 'Confirmed', 'Shipped'].includes(o.status));
    const stations = {};
    for (const s of AV.stations) {
      const short = stationShort(s.code), od = transits.some(t => t.overdue && (t.to === s.code));
      stations[s.code] = { label: short ? short + ' below ROP' : 'Stock OK', alert: short > 0 || od };
    }
    return { transits, pos, stations };
  }

  /* ---------- views ---------- */
  const VIEWS = {};

  VIEWS.tower = function (el) {
    el.innerHTML = head('Control tower', 'All stations · demo clock ' + fDT(AV.clock()), '<div class="row"><a class="btn" href="#lab">See the evidence</a></div>') +
      '<div class="grid g4" id="tiles"></div>' +
      '<div class="split"><div class="stack"><div class="radar" id="globe" style="height:min(560px,70vh)"><div class="cap"><h2>Network</h2><span class="s">Drag to turn. Select a station for its stock.</span></div>' +
      '<div class="legend"><span><i style="background:var(--locator)"></i>Station</span><span><i style="background:#F0A73A"></i>Transfer in transit</span><span><i style="background:#F0A73A;height:8px;width:8px;border-radius:50%"></i>Overdue, stuck</span><span><i style="background:var(--locator);opacity:.6"></i>Supplier order inbound</span></div></div>' +
      '<div class="card" id="story"></div></div>' +
      '<div class="stack"><div class="card" id="attn"></div><div class="card" id="feed"></div></div></div>' +
      '<div class="card" id="heat"></div>';
    const g = AV.Globe.mount($('#globe'), { data: globeData(), onStation: (code) => { showStation(code); } });
    cleanup.push(() => g.destroy());
    VIEWS.tower.refresh = () => { tiles(); attention(); feed(); g.update(globeData()); heat(); story(); };
    VIEWS.tower.refresh();
  };
  function tiles() {
    const tr = AV.transits(S), od = tr.filter(t => t.overdue).length;
    const recs = AV.recommend(S).filter(r => !r.decision || r.decision.status === 'Awaiting second approval');
    const high = recs.filter(r => r.value >= S.limit && !r.aog).length;
    const aog = S.requests.filter(q => q.status === 'Open' && q.priority === 'AOG');
    const box = $('#tiles'); if (!box) return;
    box.innerHTML =
      '<div class="tile"><span class="label">Parts in transit</span><span class="v">' + tr.length + '</span><span class="n ' + (od ? 't-warn' : '') + '">' + (od ? '<b>' + od + ' overdue</b> · window ' + AV.OVERDUE_HOURS + ' h' : 'All within ' + AV.OVERDUE_HOURS + ' h window') + '</span></div>' +
      '<div class="tile"><span class="label">Open recommendations</span><span class="v">' + recs.length + '</span><span class="n">' + (high ? '<b>' + high + '</b> at or above ' + usdK(S.limit) + ' limit' : 'None above the approval limit') + '</span></div>' +
      '<div class="tile"><span class="label">AOG requests open</span><span class="v">' + aog.length + '</span><span class="n ' + (aog.length ? 't-bad' : 't-ok') + '">' + (aog.length ? '<b>' + aog.map(q => q.aircraft + ' at ' + q.station).join(', ') + '</b>' : '<b>No aircraft on ground</b>') + '</span></div>' +
      '<div class="tile"><span class="label">Inventory value</span><span class="v">' + usdK(AV.inventoryValue(S)).replace('USD ', '') + '</span><span class="n">USD, all stations and in transit</span></div>';
  }
  function attention() {
    const box = $('#attn'); if (!box) return;
    const rows = [];
    for (const t of AV.transits(S).filter(t => t.overdue)) {
      const it = t.items[0];
      rows.push('<div class="li"><span class="sev warn"></span><div class="grow"><b>' + esc(part(it.pn).name) + '</b><span class="small muted"><span class="mono">' + esc(it.id) + '</span> · ' + t.from + ' → ' + t.to + ' · sent ' + fDate(t.ts) + '</span><span class="small">' + chip('overdue', 'Overdue ' + age(t.ts)) + '</span></div><button class="btn ghost" data-act="hist" data-id="' + esc(it.id) + '">History</button></div>');
    }
    for (const q of S.requests.filter(q => q.status === 'Open')) rows.push('<div class="li"><span class="sev ' + (q.priority === 'AOG' ? 'bad' : 'loc') + '"></span><div class="grow"><b>' + esc(part(q.pn).name) + ' for ' + q.aircraft + '</b><span class="small muted">' + q.id + ' · ' + q.station + ' · ' + esc(q.note || '') + '</span><span>' + chip(q.priority === 'AOG' ? 'aog' : 'routine', q.priority) + '</span></div><button class="btn ghost" data-act="findpn" data-pn="' + esc(q.pn) + '">Find</button></div>');
    const recs = AV.recommend(S).filter(r => !r.decision);
    if (recs.length) rows.push('<div class="li"><span class="sev loc"></span><div class="grow"><b>' + recs.length + ' reorder recommendations waiting</b><span class="small muted">Each one shows its reason and approval path.</span></div><a class="btn ghost" href="#replenish">Review</a></div>');
    box.innerHTML = '<div class="ch"><h2>Needs attention</h2><span class="small muted">' + rows.length + ' items</span></div><div class="list">' + (rows.join('') || '<div class="empty">Nothing needs attention.</div>') + '</div>';
  }
  function feed() {
    const box = $('#feed'); if (!box) return;
    const ev = S.events.slice(-7).reverse();
    const lat = S.lastLatencies || [];
    const avg = lat.length ? lat.reduce((s, v) => s + v, 0) / lat.length : null;
    box.innerHTML = '<div class="ch"><h2>Ledger feed</h2><span class="small muted">' + (avg != null ? 'Scan to every screen: <b class="mono">' + avg.toFixed(0) + ' ms</b> avg · target under 5 s' : 'Turn on the scanner feed to measure latency') + '</span></div><div class="list">' +
      ev.map(e => '<div class="li"><div class="grow"><span class="small"><b>' + esc(EVL[e.type] || e.type) + '</b> · <span class="mono">' + esc(e.item || e.trf) + '</span>' + (e.qty && e.qty > 1 ? ' × ' + e.qty : '') + '</span><span class="small muted">' + fTime(e.ts) + ' · ' + esc([e.from, e.to].filter(Boolean).join(' → ') || '') + ' · ' + esc(e.source || '') + '</span></div></div>').join('') + '</div>';
  }
  function story() {
    const box = $('#story'); if (!box) return;
    const it = S.items['HP-10482'];
    let b;
    if (it.transit) b = '<span class="label">Avilo ledger, live</span><span class="big">In transit LHR → SIN</span><span>Sent ' + fDate(it.transit.ts) + ' under ' + it.transit.trf + '. ' + chip('overdue', 'Overdue ' + age(it.transit.ts)) + '</span><span class="small muted">Never confirmed at Singapore. Avilo does not count it as stock anywhere until someone confirms receipt.</span>';
    else b = '<span class="label">Avilo ledger, live</span><span class="big">' + esc(AV.condLabel(it.cond)) + ' at ' + esc(it.loc || it.onAircraft) + '</span><span class="small muted">Receipt confirmed. The C-check at LHR can now be served by a transfer back from SIN.</span>';
    box.innerHTML = '<div class="ch"><h2>Where is hydraulic pump <span class="mono">HP-10482</span>?</h2><button class="btn ghost" data-act="hist" data-id="HP-10482">Full history</button></div>' +
      '<div class="vs"><div class="side-a"><span class="label">Weekly spreadsheet, last updated Monday</span><span class="big">1 in stock at LHR</span><span class="small muted">The transfer to Singapore was never keyed in. Planners order against this number.</span></div><span class="arrow">vs</span><div class="side-b">' + b + '</div></div>' +
      (it.transit && AV.can(AV.userBy['u-op2'], 'stores.use', 'SIN') ? '<p class="note">Try it: sign in as <b>L. Tan</b> (Stores, SIN) and confirm receipt. The control tower, the globe and the reorder queue all update from that one event.</p>' : '');
  }
  function heat() {
    const box = $('#heat'); if (!box) return;
    const parts = AV.parts.filter(p => p.crit !== 'C');
    const tr = AV.transits(S);
    box.innerHTML = '<div class="ch"><h2>Serviceable stock against reorder point</h2><span class="small muted">Critical A and B parts · cell shows on hand / reorder point · red is below, amber is at</span></div><div class="tbl-wrap"><table class="heat"><thead><tr><th>Part</th><th>P/N</th><th>Crit.</th>' + AV.stations.map(s => '<th class="num">' + s.code + '</th>').join('') + '</tr></thead><tbody>' +
      parts.map(p => '<tr class="click" data-act="findpn" data-pn="' + esc(p.pn) + '"><td>' + esc(p.name) + '</td><td class="mono small">' + esc(p.pn) + '</td><td>' + p.crit + '</td>' + AV.stations.map(s => {
        const a = AV.available(S, p.pn, s.code), r = AV.ropFor(p.pn, s.code).avilo;
        const inb = tr.filter(t => t.to === s.code).reduce((n, t) => n + t.items.filter(i => i.pn === p.pn).reduce((m, i) => m + i.qty, 0), 0);
        return '<td class="cell ' + (a < r ? 'low' : a === r ? 'at' : '') + '">' + a + ' / ' + r + (inb ? ' <span title="in transit">+' + inb + '</span>' : '') + '</td>';
      }).join('') + '</tr>').join('') + '</tbody></table></div>';
  }
  function showStation(code) {
    const st = AV.stations.find(s => s.code === code);
    const items = Object.values(S.items).filter(i => i.loc === code && i.qty > 0 && i.cond !== 'issued');
    const crit = AV.parts.filter(p => p.crit !== 'C').map(p => ({ p, a: AV.available(S, p.pn, code), r: AV.ropFor(p.pn, code).avilo })).filter(x => x.a < x.r);
    toast(st.name + ': ' + items.length + ' stock records, ' + (crit.length ? crit.length + ' critical parts below reorder point (' + crit.map(x => x.p.name).join(', ') + ').' : 'all critical parts at or above reorder point.'));
  }
  const EVL = { RECEIVE: 'Received', VERIFY: 'Certificate verified', CONDITION: 'Condition changed', TRANSFER_OUT: 'Transfer out', TRANSFER_IN: 'Transfer received', ISSUE: 'Issued', RESERVE: 'Reserved', RELEASE: 'Reservation released', TURN_IN: 'Turned in', ADJUST: 'Adjusted', SCRAP: 'Scrapped' };

  /* ---------- Stores ---------- */
  let storeSt = null, lookup = '';
  VIEWS.stores = function (el) {
    const scope = user.scope;
    if (!storeSt || !scope.includes(storeSt)) storeSt = scope[0];
    const st = storeSt;
    const inbound = AV.transits(S).filter(t => t.to === st);
    const deliveries = S.pos.filter(o => o.station === st && o.status === 'Shipped');
    const reserved = Object.values(S.items).filter(i => i.loc === st && i.reserved);
    const tasks = S.tasks.filter(t => t.from === st && t.status === 'Open');
    const stock = Object.values(S.items).filter(i => i.loc === st && i.qty > 0 && i.cond !== 'issued' && i.cond !== 'scrapped').sort((a, b) => a.pn.localeCompare(b.pn));
    const work = [];
    for (const t of inbound) work.push('<div class="li"><span class="sev ' + (t.overdue ? 'warn' : 'loc') + '"></span><div class="grow"><b>Confirm receipt · ' + t.trf + '</b><span class="small muted">From ' + t.from + ' · sent ' + fDT(t.ts) + ' · ' + t.items.map(i => '<span class="mono">' + esc(i.id) + '</span> ' + esc(part(i.pn).name) + (i.qty > 1 ? ' × ' + i.qty : '')).join(', ') + '</span><span>' + chip(t.overdue ? 'overdue' : 'transit', t.overdue ? 'Overdue ' + age(t.ts) : 'In transit') + '</span></div><button class="btn primary lg" data-act="tin" data-trf="' + t.trf + '">Confirm receipt</button></div>');
    for (const t of tasks) work.push('<div class="li"><span class="sev bad"></span><div class="grow"><b>Send ' + t.qty + ' × ' + esc(part(t.pn).name) + ' to ' + t.to + '</b><span class="small muted">' + esc(t.why) + '</span></div><button class="btn primary lg" data-act="task" data-id="' + t.id + '">Send transfer</button></div>');
    for (const o of deliveries) work.push('<div class="li"><span class="sev loc"></span><div class="grow"><b>Receive delivery · ' + o.id + '</b><span class="small muted">' + o.qty + ' × ' + esc(part(o.pn).name) + ' from ' + esc(AV.supBy[o.sup].name) + ' · ' + esc(o.tracking || '') + ' · certificate ' + (o.certUploaded ? 'uploaded' : 'not yet uploaded') + '</span></div><button class="btn primary lg" data-act="rcv" data-id="' + o.id + '">Receive</button></div>');
    for (const i of reserved) { const q = S.requests.find(r => r.id === i.reserved); if (q && q.station === st && q.status === 'Open') work.push('<div class="li"><span class="sev ' + (q.priority === 'AOG' ? 'bad' : 'loc') + '"></span><div class="grow"><b>Issue <span class="mono">' + esc(i.id) + '</span> to ' + q.aircraft + '</b><span class="small muted">' + q.id + ' · ' + q.wo + ' · ' + esc(part(i.pn).name) + '</span><span>' + chip(q.priority === 'AOG' ? 'aog' : 'routine', q.priority) + '</span></div><button class="btn primary lg" data-act="issue" data-id="' + esc(i.id) + '" data-req="' + q.id + '">Issue</button></div>'); }

    el.innerHTML = head('Stores · ' + st, AV.stations.find(s => s.code === st).name + ' · ' + esc(user.name), scope.length > 1 ? '<div class="row">' + scope.map(c => '<button class="btn' + (c === st ? ' primary' : '') + '" data-act="storeSt" data-st="' + c + '">' + c + '</button>').join('') + '</div>' : '') +
      '<div class="card"><label class="label" for="scanIn">Scan or type a part number, serial or batch</label><form class="scan" id="scanForm"><input id="scanIn" autocomplete="off" spellcheck="false" placeholder="e.g. HP-10482 or 3214552-3" value="' + esc(lookup) + '"><button class="btn primary lg" type="submit">Look up</button></form><div id="scanOut"></div></div>' +
      '<div class="split"><div class="card"><div class="ch"><h2>Work for ' + st + '</h2><span class="small muted">' + work.length + ' tasks</span></div><div class="list">' + (work.join('') || '<div class="empty">No receipts, transfers or issues waiting.</div>') + '</div></div>' +
      '<div class="card"><div class="ch"><h2>Turn in a removed part</h2></div><form id="turnForm" class="stack" style="gap:10px"><div class="field"><label class="label" for="tiPn">Part</label><select id="tiPn">' + AV.parts.filter(p => p.type === 'rotable').map(p => '<option value="' + p.pn + '">' + esc(p.name) + ' · ' + p.pn + '</option>').join('') + '</select></div><div class="grid g2" style="gap:10px"><div class="field"><label class="label" for="tiSn">Serial number</label><input id="tiSn" class="mono" required placeholder="S/N on data plate"></div><div class="field"><label class="label" for="tiAc">Removed from</label><select id="tiAc">' + AV.fleet.map(f => '<option>' + f.tail + '</option>').join('') + '</select></div></div><div class="field"><label class="label" for="tiWhy">Reason</label><input id="tiWhy" value="Removed on condition"></div><button class="btn" type="submit">Record as unserviceable</button></form></div></div>' +
      '<div class="card"><div class="ch"><h2>Stock at ' + st + '</h2><span class="small muted">' + stock.length + ' records · derived from the ledger</span></div><div class="tbl-wrap"><table><thead><tr><th>Part</th><th>P/N</th><th>S/N or batch</th><th>Condition</th><th class="num">Qty</th><th>Expiry</th></tr></thead><tbody>' +
      stock.map(i => '<tr class="click" data-act="look" data-id="' + esc(i.id) + '"><td>' + esc(part(i.pn).name) + '</td><td class="mono small">' + i.pn + '</td><td class="mono small">' + esc(i.id) + '</td><td>' + itemChip(i) + (i.reserved ? ' ' + chip('reserved', 'For ' + i.reserved) : '') + '</td><td class="num mono">' + i.qty + ' ' + part(i.pn).unit + '</td><td class="small">' + (i.expiry ? fDate(i.expiry) : '–') + '</td></tr>').join('') + '</tbody></table></div></div>';
    $('#scanForm').addEventListener('submit', (e) => { e.preventDefault(); lookup = $('#scanIn').value.trim(); scanResult(); });
    $('#turnForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const sn = $('#tiSn').value.trim().toUpperCase(); if (!sn) return;
      call('ingest', { e: { type: 'TURN_IN', item: sn, pn: $('#tiPn').value, qty: 1, to: st, cond: 'unserviceable', aircraft: $('#tiAc').value, reason: $('#tiWhy').value } }, sn + ' recorded as unserviceable at ' + st + '.');
    });
    if (lookup) scanResult();
    setTimeout(() => { const i = $('#scanIn'); if (i && !lookup) i.focus({ preventScroll: true }); }, 0);
  };
  function scanResult() {
    const out = $('#scanOut'); if (!out) return;
    const q = lookup.toUpperCase();
    const hits = Object.values(S.items).filter(i => (i.id.toUpperCase() === q || i.pn.toUpperCase() === q || i.id.toUpperCase().startsWith(q)) && i.cond !== 'scrapped').slice(0, 8);
    if (!q) { out.innerHTML = ''; return; }
    if (!hits.length) { out.innerHTML = '<p class="note" style="margin-top:10px">No stock record matches <span class="mono">' + esc(lookup) + '</span>. Check the data plate, or receive it against a purchase order first.</p>'; return; }
    out.innerHTML = '<div class="list" style="margin-top:8px">' + hits.map(i => {
      const p = part(i.pn), here = i.loc === storeSt;
      const acts = here && i.cond === 'serviceable' ? '<div class="row"><select class="inp" id="to-' + esc(i.id) + '" style="width:auto">' + AV.stations.filter(s => s.code !== storeSt).map(s => '<option>' + s.code + '</option>').join('') + '</select>' + (i.qty > 1 ? '<input class="inp mono" id="qty-' + esc(i.id) + '" type="number" min="1" max="' + i.qty + '" value="1" style="width:80px">' : '') + '<button class="btn" data-act="tout" data-id="' + esc(i.id) + '">Transfer out</button></div>' : '';
      return '<div class="li"><div class="grow"><b>' + esc(p.name) + '</b><span class="small muted"><span class="mono">P/N ' + p.pn + ' · ' + esc(i.id) + '</span> · ' + (i.loc ? 'at ' + i.loc : i.transit ? i.transit.from + ' → ' + i.transit.to : i.onAircraft ? 'fitted to ' + i.onAircraft : '') + ' · ' + i.qty + ' ' + p.unit + '</span><span>' + itemChip(i) + (i.reserved ? ' ' + chip('reserved', 'For ' + i.reserved) : '') + '</span>' + acts + '</div><button class="btn ghost" data-act="hist" data-id="' + esc(i.id) + '">History</button></div>';
    }).join('') + '</div>';
  }

  /* ---------- Find a part (3D aircraft) ---------- */
  let findPn = '3214552-3', findQ = '';
  VIEWS.find = function (el) {
    const p = part(findPn);
    const q = findQ.toLowerCase();
    const parts = AV.parts.filter(x => !q || x.name.toLowerCase().includes(q) || x.pn.toLowerCase().includes(q) || Object.values(S.items).some(i => i.pn === x.pn && i.id.toLowerCase().includes(q)));
    const tr = AV.transits(S);
    const avail = AV.stations.map(s => ({ s, a: AV.available(S, p.pn, s.code), other: Object.values(S.items).filter(i => i.pn === p.pn && i.loc === s.code && (i.cond !== 'serviceable' || i.reserved)) }));
    const moving = tr.filter(t => t.items.some(i => i.pn === p.pn));
    const reqStations = user.role === 'technician' ? user.scope : AV.stations.map(s => s.code);
    const canReq = AV.can(user, 'request.raise');
    const openReqs = S.requests.filter(r => r.status === 'Open' || r.status === 'Issued').slice().reverse();
    const aogReq = S.requests.find(r => r.pn === p.pn && r.status === 'Open' && r.priority === 'AOG');
    el.innerHTML = head('Find a part', 'Search every station, including parts in transit. The aircraft shows where the part is fitted.') +
      '<div class="split"><div class="stack"><div class="radar" id="plane" style="height:min(440px,60vh)"><div class="cap"><h2>' + esc(p.name) + '</h2><span class="s">' + esc(AV.zones[p.zone]) + ' · ATA ' + p.ata + ' · <span class="mono">P/N ' + p.pn + '</span> · generic twin-jet model</span></div></div>' +
      '<div class="card"><div class="ch"><h2>Where it is</h2><span class="small muted">' + p.type + ' · criticality ' + p.crit + ' · ' + usd(p.cost) + ' each</span></div><div class="tbl-wrap"><table><thead><tr><th>Station</th><th class="num">Serviceable, free</th><th>Other units</th><th class="num">Reorder point</th></tr></thead><tbody>' +
      avail.map(x => '<tr><td><b>' + x.s.code + '</b> <span class="small muted">' + esc(x.s.name) + '</span></td><td class="num mono">' + x.a + '</td><td>' + (x.other.map(i => itemChip(i) + (i.reserved ? ' ' + chip('reserved', 'For ' + i.reserved) : '')).join(' ') || '<span class="muted small">–</span>') + '</td><td class="num mono">' + AV.ropFor(p.pn, x.s.code).avilo + '</td></tr>').join('') +
      moving.map(t => '<tr><td colspan="4">' + chip(t.overdue ? 'overdue' : 'transit', t.overdue ? 'Overdue ' + age(t.ts) : 'In transit') + ' <span class="mono small">' + t.items.filter(i => i.pn === p.pn).map(i => esc(i.id) + (i.qty > 1 ? ' × ' + i.qty : '')).join(', ') + '</span> ' + t.from + ' → ' + t.to + ' <span class="small muted">since ' + fDate(t.ts) + '</span></td></tr>').join('') +
      '</tbody></table></div></div></div>' +
      '<div class="stack"><div class="card"><label class="label" for="findIn">Search by name, P/N or serial</label><input class="inp" id="findIn" value="' + esc(findQ) + '" placeholder="e.g. brake, 3214552-3, HP-10482"><div class="list" style="max-height:320px;overflow:auto">' +
      parts.map(x => { const tot = AV.stations.reduce((n, s) => n + AV.available(S, x.pn, s.code), 0); return '<div class="li click" style="cursor:pointer" data-act="findpn" data-pn="' + x.pn + '"><span class="sev ' + (x.pn === p.pn ? 'loc' : '') + '"></span><div class="grow"><b>' + esc(x.name) + '</b><span class="small muted mono">' + x.pn + ' · ATA ' + x.ata + '</span></div><span class="mono small">' + tot + ' ' + x.unit + '</span></div>'; }).join('') + '</div></div>' +
      (canReq ? '<div class="card"><h2>Request this part</h2><form id="reqForm" class="stack" style="gap:10px"><div class="grid g2" style="gap:10px"><div class="field"><label class="label" for="rqAc">Aircraft</label><select id="rqAc">' + AV.fleet.map(f => '<option value="' + f.tail + '">' + f.tail + ' · ' + esc(f.status) + '</option>').join('') + '</select></div><div class="field"><label class="label" for="rqSt">Needed at</label><select id="rqSt">' + reqStations.map(c => '<option>' + c + '</option>').join('') + '</select></div></div><div class="grid g2" style="gap:10px"><div class="field"><label class="label" for="rqWo">Work order</label><input id="rqWo" class="mono" value="WO-88' + (300 + S.nextReq % 100) + '"></div><div class="field"><label class="label" for="rqPr">Priority</label><select id="rqPr"><option>Routine</option><option>AOG</option></select></div></div><p class="note">An AOG request reserves the nearest serviceable unit straight away and creates a transfer task if it sits at another station.</p><button class="btn primary" type="submit">Raise request</button></form></div>' : '') +
      '<div class="card"><div class="ch"><h2>Part requests</h2></div><div class="list">' + openReqs.map(r => '<div class="li"><span class="sev ' + (r.priority === 'AOG' && r.status === 'Open' ? 'bad' : '') + '"></span><div class="grow"><b>' + esc(part(r.pn).name) + '</b><span class="small muted">' + r.id + ' · ' + r.aircraft + ' · ' + r.station + ' · ' + r.status + ' · by ' + esc(uname(r.by)) + '</span></div>' + chip(r.priority === 'AOG' ? 'aog' : 'routine', r.priority) + '</div>').join('') + '</div></div></div></div>';
    const pl = AV.Plane.mount($('#plane'), { zone: p.zone, color: aogReq ? getComputedStyle(document.documentElement).getPropertyValue('--bad').trim() : null, label: (aogReq ? 'AOG · ' + aogReq.aircraft + ' · ' : '') + AV.zones[p.zone], kind: aogReq ? 'bad' : 'loc' });
    cleanup.push(() => pl.destroy());
    const fi = $('#findIn');
    fi.addEventListener('input', () => { findQ = fi.value; const pos = fi.selectionStart; render(); const n = $('#findIn'); n.focus(); n.setSelectionRange(pos, pos); });
    const rf = $('#reqForm');
    if (rf) rf.addEventListener('submit', (e) => { e.preventDefault(); raiseRequest(p, $('#rqAc').value, $('#rqSt').value, $('#rqWo').value, $('#rqPr').value); });
  };
  function raiseRequest(p, ac, st, wo, pr) { call('raise_request', { p_pn: p.pn, p_station: st, p_aircraft: ac, p_wo: wo, p_priority: pr }); }

  /* ---------- Replenishment ---------- */
  VIEWS.replenish = function (el) {
    const recs = AV.recommend(S);
    const open = recs.filter(r => !r.decision || r.decision.status === 'Awaiting second approval');
    const done = Object.entries(S.recDecisions).filter(([, d]) => !['Proposed', 'Awaiting second approval'].includes(d.status));
    const card = (r) => {
      const p = part(r.pn), d = r.decision || { approvals: [] };
      const high = r.value >= S.limit;
      const path = r.aog ? 'AOG fast path: one approval by Planner or Procurement Manager, reviewed within 24 h' : high ? 'At or above ' + usd(S.limit) + ': Planner, then Procurement Manager' : 'Below ' + usd(S.limit) + ': one approval';
      let block = '';
      if (!AV.can(user, 'rec.approve')) block = 'Your role can view but not approve.';
      else if (d.approvals.some(a => a.by === user.id)) block = 'You already approved. A second person must act.';
      else if (high && !r.aog && user.role === 'procurement' && !d.approvals.length) block = 'Waiting for the Planner\'s approval first.';
      return '<div class="card"><div class="ch" style="align-items:flex-start"><div class="stack" style="gap:2px"><h3 style="font-size:17px">Reorder ' + r.qty + ' × ' + esc(p.name) + ', ' + r.station + '</h3><span class="small muted mono">P/N ' + p.pn + ' · ' + esc(AV.supBy[p.sup].name) + ' · lead ' + p.lead + ' d</span></div><div class="stack" style="gap:4px;align-items:flex-end"><span class="mono" style="font-size:18px">' + usd(r.value) + '</span><span class="row">' + (r.aog ? chip('aog') : '') + '<span class="chip c-off">Crit. ' + r.crit + '</span></span></div></div>' +
        '<div class="why">' + esc(r.why) + '</div>' +
        (r.lateral ? '<div class="row small"><span>Cheaper and faster: ' + r.lateral.code + ' has ' + r.lateral.spare + ' spare above its own reorder point.</span>' + (AV.can(user, 'rec.approve') ? '<button class="btn ghost" data-act="lateral" data-id="' + r.id + '">Transfer from ' + r.lateral.code + ' instead</button>' : '') + '</div>' : '') +
        '<div class="ch"><span class="small muted">' + path + (d.approvals.length ? ' · approved by ' + d.approvals.map(a => esc(uname(a.by))).join(', ') : '') + '</span><div class="row">' + (block ? '<span class="small muted">' + block + '</span>' : '') + '<button class="btn danger" data-act="rej" data-id="' + r.id + '"' + (block && !AV.can(user, 'rec.approve') ? ' disabled' : '') + '>Reject</button><button class="btn primary" data-act="appr" data-id="' + r.id + '"' + (block ? ' disabled' : '') + '>Approve</button></div></div></div>';
    };
    const pos = S.pos.filter(o => o.status !== 'Received').slice().reverse();
    el.innerHTML = head('Replenishment', 'The engine recommends. People approve. Nothing is ordered automatically.', '<span class="pill" style="color:var(--ink-muted);border-color:var(--line)">Approval limit ' + usd(S.limit) + '</span>') +
      '<div class="grid g2" style="align-items:start"><div class="stack">' + (open.map(card).join('') || '<div class="empty">No open recommendations.</div>') + '</div>' +
      '<div class="stack"><div class="card"><div class="ch"><h2>Purchase orders in flight</h2></div><div class="tbl-wrap"><table><thead><tr><th>PO</th><th>Part</th><th>To</th><th>Supplier</th><th>Status</th><th class="num">Value</th></tr></thead><tbody>' +
      pos.map(o => '<tr><td class="mono small">' + o.id + '</td><td>' + o.qty + ' × ' + esc(part(o.pn).name) + '</td><td>' + o.station + '</td><td class="small">' + esc(AV.supBy[o.sup].name) + '</td><td>' + esc(o.status) + (o.promised ? '<div class="small muted">due ' + fDate(o.promised) + '</div>' : '') + '</td><td class="num mono">' + usd(o.value) + '</td></tr>').join('') + '</tbody></table></div></div>' +
      '<div class="card"><div class="ch"><h2>Decided</h2></div><div class="list">' + (done.map(([id, d]) => { const pn = id.slice(4, id.lastIndexOf('-')); return '<div class="li"><div class="grow"><b>' + esc(part(pn).name) + ' · ' + id.slice(id.lastIndexOf('-') + 1) + '</b><span class="small muted">' + esc(d.status) + (d.po ? ' · ' + d.po : '') + (d.note ? ' · ' + esc(d.note) : '') + '</span></div></div>'; }).join('') || '<div class="empty">Decisions you make appear here.</div>') + '</div></div>' +
      '<div class="card"><h2>Supplier scorecards</h2><div class="tbl-wrap"><table><thead><tr><th>Supplier</th><th class="num">Orders</th><th class="num">On time</th><th class="num">Avg lead</th></tr></thead><tbody>' + AV.suppliers.map(s => { const c = AV.scorecard(S, s.id); return '<tr><td>' + esc(s.name) + ' <span class="small muted">' + s.code + '</span></td><td class="num mono">' + c.n + '</td><td class="num mono">' + (c.onTime == null ? '–' : Math.round(c.onTime * 100) + '%') + '</td><td class="num mono">' + (c.lead == null ? '–' : c.lead.toFixed(0) + ' d') + '</td></tr>'; }).join('') + '</tbody></table></div><p class="note">Measured from promised and received dates on past orders. These lead times feed back into reorder points.</p></div></div></div>';
  };

  /* ---------- Forecasts ---------- */
  let fcPn = '3214552-3', fcSt = 'LHR';
  VIEWS.forecast = function (el) {
    const p = part(fcPn), y = AV.history[fcPn][fcSt];
    const m = { Mean: AV.movingMean(y), Croston: AV.croston(y, 0.1, false), SBA: AV.croston(y, 0.1, true), TSB: AV.tsb(y, 0.1, 0.1) };
    const ev = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, AV.evaluate(y, v.fitted, 78)]));
    const best = Object.entries(ev).sort((a, b) => a[1].mae - b[1].mae)[0][0];
    const r = AV.ropFor(fcPn, fcSt);
    const zeros = y.filter(v => v === 0).length;
    el.innerHTML = head('Forecasts', 'Spare-parts demand is sparse and lumpy. Avilo uses intermittent-demand methods and always shows the classic baseline.',
      '<div class="row"><select class="inp" id="fcPn" style="width:auto">' + AV.parts.map(x => '<option value="' + x.pn + '"' + (x.pn === fcPn ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select><select class="inp" id="fcSt" style="width:auto">' + AV.stations.map(s => '<option' + (s.code === fcSt ? ' selected' : '') + '>' + s.code + '</option>').join('') + '</select></div>') +
      '<div class="card"><div class="ch"><h2>' + esc(p.name) + ' at ' + fcSt + ', weekly demand</h2><span class="small muted">104 weeks · ' + zeros + ' weeks with zero demand · shaded weeks are the hold-out test</span></div>' + fcChart(y, m.SBA.fitted, m.SBA.next) + '<div class="row small muted"><span><i style="display:inline-block;width:10px;height:10px;background:var(--off);opacity:.5;border-radius:2px"></i> Demand</span><span><i style="display:inline-block;width:14px;height:2px;background:var(--locator);vertical-align:middle"></i> SBA forecast</span><span>● Next week: <b class="mono">' + m.SBA.next.toFixed(2) + '</b> ' + p.unit + '</span></div></div>' +
      '<div class="grid g2" style="align-items:start"><div class="card"><h2>Method comparison</h2><p class="note">One-step-ahead error over the last 26 weeks. Lower is better. A method only earns its place if it beats the simple mean.</p><div class="tbl-wrap"><table><thead><tr><th>Method</th><th class="num">Mean abs. error</th><th class="num">Bias</th><th></th></tr></thead><tbody>' +
      Object.entries(ev).map(([k, v]) => '<tr' + (k === best ? ' class="sel"' : '') + '><td><b>' + k + '</b></td><td class="num mono">' + v.mae.toFixed(3) + '</td><td class="num mono">' + (v.bias >= 0 ? '+' : '') + v.bias.toFixed(3) + '</td><td>' + (k === best ? chip('serviceable', 'Best here') : '') + '</td></tr>').join('') + '</tbody></table></div></div>' +
      '<div class="card"><h2>Reorder point</h2><div class="grid g2" style="gap:12px"><div class="tile"><span class="label">Classic baseline</span><span class="v">' + r.classic + '</span><span class="n mono">d̄·L + z·σ·√L</span><span class="n">' + r.mean.toFixed(2) + ' × ' + r.Lw.toFixed(1) + ' wk + 1.65 × ' + r.sd.toFixed(2) + ' × √' + r.Lw.toFixed(1) + '</span></div><div class="tile"><span class="label">Avilo</span><span class="v">' + r.avilo + '</span><span class="n">' + (p.type === 'rotable' ? 'Poisson quantile of SBA demand over lead time' : 'SBA demand over lead time plus safety stock from forecast error') + '</span><span class="n">Service level ' + Math.round(AV.SERVICE_LEVEL[p.crit] * 100) + '% for criticality ' + p.crit + '</span></div></div><p class="note">The classic formula assumes demand is normally distributed. With ' + zeros + ' zero weeks out of 104, it is not. Avilo sets service level by criticality, so an AOG-critical part gets more protection than a reading lamp.</p></div></div>';
    $('#fcPn').addEventListener('change', (e) => { fcPn = e.target.value; render(); });
    $('#fcSt').addEventListener('change', (e) => { fcSt = e.target.value; render(); });
  };
  function fcChart(y, f, next) {
    const W = 760, H = 240, ml = 34, mr = 16, mt = 12, mb = 26, iw = W - ml - mr, ih = H - mt - mb;
    const max = Math.max(1, ...y, next) * 1.1, n = y.length + 1, bw = iw / n;
    const Y = (v) => mt + ih - (v / max) * ih;
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Weekly demand with forecast">';
    s += '<rect x="' + (ml + 78 * bw) + '" y="' + mt + '" width="' + (26 * bw) + '" height="' + ih + '" style="fill:var(--locator-tint)"/>';
    const step = max > 10 ? Math.ceil(max / 4 / 5) * 5 : max > 4 ? 2 : 1;
    for (let v = 0; v <= max; v += step) s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" style="stroke:var(--line)"/><text x="' + (ml - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    y.forEach((v, i) => { if (v > 0) s += '<rect x="' + (ml + i * bw + bw * 0.15) + '" y="' + Y(v) + '" width="' + (bw * 0.7) + '" height="' + (Y(0) - Y(v)) + '" rx="1" style="fill:var(--off);opacity:.55"/>'; });
    let d = ''; f.forEach((v, i) => { if (!isNaN(v)) d += (d ? 'L' : 'M') + (ml + i * bw + bw / 2).toFixed(1) + ' ' + Y(v).toFixed(1); });
    d += 'L' + (ml + y.length * bw + bw / 2).toFixed(1) + ' ' + Y(next).toFixed(1);
    s += '<path d="' + d + '" style="fill:none;stroke:var(--locator);stroke-width:2"/>';
    s += '<circle cx="' + (ml + y.length * bw + bw / 2) + '" cy="' + Y(next) + '" r="4.5" style="fill:var(--locator)"/>';
    [0, 26, 52, 78, 103].forEach(i => { s += '<text x="' + (ml + i * bw + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + (i === 103 ? 'last wk' : 'wk ' + (i + 1)) + '</text>'; });
    return s + '</svg>';
  }

  /* ---------- Quality ---------- */
  VIEWS.quality = function (el) {
    const pend = Object.values(S.items).filter(i => i.cond === 'pending' && i.loc);
    const q = Object.values(S.items).filter(i => i.cond === 'quarantined' && i.loc);
    const recv = (id) => { const e = S.events.find(x => x.item === id && x.type === 'RECEIVE'); return e ? e.actor : null; };
    el.innerHTML = head('Quality', 'Only the Compliance Officer decides whether a part is airworthy. A part waiting here cannot be issued.') +
      '<div class="grid g2" style="align-items:start"><div class="card"><div class="ch"><h2>Certificates to verify</h2><span class="small muted">' + pend.length + '</span></div><div class="list">' +
      (pend.map(i => { const p = part(i.pn), self = recv(i.id) === user.id; return '<div class="li"><span class="sev loc"></span><div class="grow"><b>' + esc(p.name) + '</b><span class="small muted mono">P/N ' + p.pn + ' · ' + esc(i.id) + ' · ' + i.loc + ' · ' + esc(i.ref || '') + '</span><span class="small">Certificate: ' + esc(i.cert || 'not uploaded') + '</span>' + (self ? '<span class="small muted">You received this part, so another inspector must verify it.</span>' : '') + '</div><div class="row"><button class="btn danger" data-act="crej" data-id="' + esc(i.id) + '">Reject</button><button class="btn primary" data-act="cver" data-id="' + esc(i.id) + '"' + (self ? ' disabled' : '') + '>Verify</button></div></div>'; }).join('') || '<div class="empty">No certificates waiting.</div>') + '</div></div>' +
      '<div class="card"><div class="ch"><h2>Quarantined and blocked</h2><span class="small muted">' + q.length + '</span></div><div class="list">' +
      (q.map(i => { const p = part(i.pn), why = S.events.filter(e => e.item === i.id && e.type === 'CONDITION').pop(); return '<div class="li"><span class="sev bad"></span><div class="grow"><b>' + esc(p.name) + '</b><span class="small muted mono">' + esc(i.id) + ' · ' + i.loc + '</span><span class="small">' + esc(why ? why.reason : '') + '</span></div><div class="row"><button class="btn danger" data-act="scrap" data-id="' + esc(i.id) + '">Scrap</button><button class="btn" data-act="release" data-id="' + esc(i.id) + '">Release</button></div></div>'; }).join('') || '<div class="empty">Nothing quarantined.</div>') + '</div></div></div>' +
      '<div class="card"><h2>Approved supplier list</h2><div class="tbl-wrap"><table><thead><tr><th>Supplier</th><th>Base</th><th>Certificate type</th><th>Status</th></tr></thead><tbody>' + AV.suppliers.map(s => '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.city) + ' · ' + s.code + '</td><td>' + (s.id === 'SUP-3' ? 'FAA 8130-3' : 'EASA Form 1') + '</td><td>' + chip('serviceable', 'Approved') + '</td></tr>').join('') + '</tbody></table></div><p class="note">Suppliers join this list only with Compliance approval. Procurement can propose new suppliers but cannot approve them.</p></div>';
  };

  /* ---------- Supplier portal ---------- */
  VIEWS.portal = function (el) {
    const sup = AV.supBy[user.supplier], mine = S.pos.filter(o => o.sup === sup.id && o.status !== 'Received').slice().reverse(), sc = AV.scorecard(S, sup.id);
    el.innerHTML = head(sup.name, 'Your orders only. Stock levels, other suppliers and internal costs are not visible here.') +
      '<div class="grid g3"><div class="tile"><span class="label">On-time delivery</span><span class="v">' + Math.round(sc.onTime * 100) + '%</span><span class="n">Last ' + sc.n + ' orders</span></div><div class="tile"><span class="label">Average lead time</span><span class="v">' + sc.lead.toFixed(0) + ' d</span><span class="n">Order sent to received</span></div><div class="tile"><span class="label">Open orders</span><span class="v">' + mine.length + '</span><span class="n">Confirm dates so planners can count on them</span></div></div>' +
      '<div class="card"><div class="ch"><h2>My orders</h2></div><div class="list">' + (mine.map(o => {
        const p = part(o.pn);
        let act = '';
        if (o.status === 'Sent') act = '<button class="btn danger" data-act="sdec" data-id="' + o.id + '">Decline</button><button class="btn primary" data-act="sacc" data-id="' + o.id + '">Accept · ship by ' + fDate(AV.clock() + (p.lead - 2) * DAY) + '</button>';
        else if (o.status === 'Confirmed') act = (o.certUploaded ? '<span class="small muted">Certificate uploaded</span>' : '<button class="btn" data-act="scert" data-id="' + o.id + '">Upload ' + (sup.id === 'SUP-3' ? '8130-3' : 'Form 1') + '</button>') + '<button class="btn primary" data-act="sship" data-id="' + o.id + '">Mark shipped</button>';
        else act = '<span class="small muted">' + esc(o.status) + (o.tracking ? ' · ' + esc(o.tracking) : '') + '</span>';
        return '<div class="li"><span class="sev ' + (o.aog ? 'bad' : 'loc') + '"></span><div class="grow"><b>' + o.id + ' · ' + o.qty + ' × ' + esc(p.name) + '</b><span class="small muted mono">P/N ' + p.pn + ' · deliver to ' + o.station + ' · sent ' + fDate(o.sent) + (o.promised ? ' · promised ' + fDate(o.promised) : '') + '</span>' + (o.aog ? '<span>' + chip('aog', 'AOG order') + '</span>' : '') + '</div><div class="row">' + act + '</div></div>';
      }).join('') || '<div class="empty">No open orders.</div>') + '</div></div>';
  };

  /* ---------- History ---------- */
  let histId = 'HP-10482';
  VIEWS.history = function (el) {
    const id = histId, it = S.items[id];
    const evs = S.events.filter(e => e.item === id || (e.item && e.item.startsWith(id + '/')) || (e.type === 'TRANSFER_IN' && S.events.some(x => x.trf === e.trf && x.item === id)));
    const picks = ['HP-10482', 'AD-55102'].concat(Object.values(S.items).filter(i => i.transit).map(i => i.id)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
    el.innerHTML = head('Part history', 'Every movement of a serial or batch, from receipt to now. Nothing here can be edited; corrections are new events.') +
      '<div class="card"><form id="hForm" class="scan"><input id="hIn" value="' + esc(id) + '" aria-label="Serial or batch number"><button class="btn primary lg" type="submit">Show history</button></form><div class="row small">Try: ' + picks.map(p => '<button class="btn ghost mono" data-act="hist" data-id="' + esc(p) + '">' + esc(p) + '</button>').join('') + '</div></div>' +
      (it ? '<div class="split"><div class="card"><div class="ch"><h2>' + esc(part(it.pn).name) + ' <span class="mono">' + esc(id) + '</span></h2>' + itemChip(it) + '</div><div class="timeline">' +
        evs.map(e => '<div class="tl"><span class="when">' + fDate(e.ts) + '<br>' + fTime(e.ts) + '</span><span class="rail"><i class="' + (e.type === 'TRANSFER_OUT' && it.transit && it.transit.trf === e.trf ? 'warn' : '') + '"></i></span><div class="what"><b>' + esc(EVL[e.type]) + (e.type === 'CONDITION' ? ': ' + esc(AV.condLabel(e.cond)) : '') + '</b><span class="small muted">' + esc([e.from, e.to].filter(Boolean).join(' → ')) + (e.trf ? ' · ' + e.trf : '') + (e.ref ? ' · ' + esc(e.ref) : '') + (e.aircraft ? ' · ' + e.aircraft : '') + (e.cert ? ' · ' + esc(e.cert) : '') + '</span><span class="small">' + esc(uname(e.actor)) + (urole(e.actor) ? ', ' + esc(urole(e.actor)) : '') + ' · via ' + esc(e.source) + (e.reason ? ' · ' + esc(e.reason) : '') + '</span></div></div>').join('') +
        (it.transit ? '<div class="tl"><span class="when">now</span><span class="rail"><i class="warn"></i></span><div class="what"><b>No receipt recorded at ' + it.transit.to + '</b><span class="small muted">' + (AV.isOverdue(it.transit) ? 'Overdue by ' + age(it.transit.ts + AV.OVERDUE_HOURS * 36e5) + '. The planner has an alert.' : 'Within the ' + AV.OVERDUE_HOURS + ' h window.') + '</span></div></div>' : '') +
        '</div></div><div class="stack"><div class="card"><h2>Right now</h2><div class="list"><div class="li"><div class="grow"><span class="label">Location</span><b>' + esc(it.loc || (it.transit ? 'Between ' + it.transit.from + ' and ' + it.transit.to : it.onAircraft ? 'Fitted to ' + it.onAircraft : '–')) + '</b></div></div><div class="li"><div class="grow"><span class="label">Condition</span>' + itemChip(it) + '</div></div><div class="li"><div class="grow"><span class="label">Certificate</span><b>' + esc(it.cert || 'Not verified') + '</b></div></div><div class="li"><div class="grow"><span class="label">Events in ledger</span><b class="mono">' + evs.length + '</b></div></div></div></div><div class="card"><h2>Why this matters</h2><p class="note">A spreadsheet stores where a part is. The ledger stores how it got there. When the two disagree, the ledger can show the exact step that went missing, who did the last one, and when.</p></div></div></div>'
        : '<div class="empty">No serial or batch <span class="mono">' + esc(id) + '</span> in the ledger.</div>');
    $('#hForm').addEventListener('submit', (e) => { e.preventDefault(); histId = $('#hIn').value.trim().toUpperCase(); render(); });
  };

  /* ---------- Simulation lab ---------- */
  let labShift = 0;
  VIEWS.lab = function (el) {
    el.innerHTML = head('Simulation lab', 'The same simulated year, run under three policies. Results are simulated, so they test the design, not real savings.', '<div class="row"><button class="btn' + (labShift === 0 ? ' primary' : '') + '" data-act="labS" data-v="0">Stable demand</button><button class="btn' + (labShift ? ' primary' : '') + '" data-act="labS" data-v="0.3">Utilisation +30% from month 4</button></div>') +
      '<div class="grid g3"><div class="card"><span class="label">A · Status quo</span><h3>Weekly spreadsheet</h3><p class="note">Planners see stock as of the last weekly update. 6% of issues and transfers are never keyed in. Classic reorder point.</p></div><div class="card"><span class="label">B · Visibility only</span><h3>Real-time ledger</h3><p class="note">Every movement recorded as it happens. Same classic reorder point as A. Isolates the value of information.</p></div><div class="card"><span class="label">C · Full Avilo</span><h3>Ledger plus forecasting</h3><p class="note">Real-time ledger, SBA forecasts, and service level set by part criticality. Re-plans every 4 weeks.</p></div></div>' +
      '<div class="card" id="labOut"><div class="empty">Running 20 simulated years per policy…</div></div>';
    setTimeout(runLab, 30);
  };
  function runLab() {
    const key = String(labShift);
    if (!labCache[key]) {
      const runs = [];
      for (let i = 0; i < 20; i++) runs.push(AV.simAll(AV.SEED + i, { shift: labShift }));
      labCache[key] = runs;
    }
    const runs = labCache[key], out = $('#labOut'); if (!out) return;
    const metric = (k, pol) => runs.map(r => r[pol][k]);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const rows = [
      ['Critical stockouts (A and B parts)', 'critical', (v) => v.toFixed(1), true],
      ['All stockout events', 'stockouts', (v) => v.toFixed(1), true],
      ['Fill rate from stock', 'fillRate', (v) => (v * 100).toFixed(1) + '%', false],
      ['Average inventory value', 'invValue', (v) => usdK(v), true],
      ['Expedite cost (assumed rates)', 'expedite', (v) => usdK(v), true],
      ['Orders placed', 'orders', (v) => v.toFixed(0), null]
    ];
    const cA = mean(metric('critical', 'A')), cB = mean(metric('critical', 'B')), cC = mean(metric('critical', 'C'));
    const red = (1 - cC / cA) * 100, redB = (1 - cB / cA) * 100;
    const met = red >= 30;
    const maxC = Math.max(cA, cB, cC);
    out.innerHTML = '<div class="ch"><h2>Results · mean of 20 simulated years · ' + (labShift ? 'utilisation +30% from month 4' : 'stable demand') + '</h2><span class="small muted">4 stations · 17 parts · common random numbers · seeds ' + AV.SEED + '–' + (AV.SEED + 19) + '</span></div>' +
      '<div class="grid g2" style="align-items:start"><div class="stack"><div class="bars">' + [['A · Status quo', cA, ''], ['B · Visibility only', cB, 'b'], ['C · Full Avilo', cC, 'c']].map(([l, v, c]) => '<div class="bar"><span>' + l + '</span><span class="track"><span class="fill ' + c + '" style="display:block;width:' + (v / maxC * 100) + '%"></span></span><span class="mono num">' + v.toFixed(1) + '</span></div>').join('') + '</div><p class="small muted">Critical stockouts per simulated year</p>' +
      '<div class="why"><b>Proposal hypothesis: at least 30% fewer critical stockouts.</b><br>A → C: <b class="mono">' + red.toFixed(0) + '%</b> fewer ' + chip(met ? 'serviceable' : 'overdue', met ? 'Met in this scenario' : 'Not met in this scenario') + '<br>A → B, visibility alone: <b class="mono">' + redB.toFixed(0) + '%</b> fewer.</div></div>' +
      '<div class="tbl-wrap"><table><thead><tr><th>Metric</th><th class="num">A</th><th class="num">B</th><th class="num">C</th><th class="num">C vs A</th></tr></thead><tbody>' +
      rows.map(([l, k, f, lowGood]) => { const a = mean(metric(k, 'A')), b = mean(metric(k, 'B')), c = mean(metric(k, 'C')); const ch = (c - a) / a * 100; const good = lowGood == null ? null : lowGood ? ch < 0 : ch > 0; return '<tr><td>' + l + '</td><td class="num mono">' + f(a) + '</td><td class="num mono">' + f(b) + '</td><td class="num mono">' + f(c) + '</td><td class="num mono" style="color:' + (good == null ? 'var(--ink-muted)' : good ? 'var(--ok)' : 'var(--bad)') + '">' + (ch >= 0 ? '+' : '') + ch.toFixed(0) + '%</td></tr>'; }).join('') + '</tbody></table></div></div>' +
      '<p class="note"><b>How to read this.</b> Most of the gain comes from visibility (A → B): planners stop ordering against stock that is not there. Forecasting (B → C) helps when demand shifts, as in the utilisation scenario, and adds little when demand is stable, because a long-run average is then already a good forecast. Expedite costs use assumed rates of USD 25,000 per A-critical stockout, 6,000 per B and 1,500 per C. False-positive shortage alerts are not computed yet: the alert definition must be agreed first.</p>';
  }

  /* ---------- Audit ---------- */
  VIEWS.audit = function (el) {
    const rows = S.audit.slice().sort((a, b) => b.ts - a.ts);
    el.innerHTML = head('Audit log', 'Who did what, when. Append-only: entries cannot be edited or deleted, including by the Super Admin.') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Role</th><th>Action</th><th>Object</th><th>Detail</th></tr></thead><tbody>' +
      rows.map(a => '<tr><td class="small mono">' + fDT(a.ts) + '</td><td>' + esc(uname(a.by)) + '</td><td class="small muted">' + esc(urole(a.by)) + '</td><td>' + esc(a.action) + '</td><td class="mono small">' + esc(a.object) + '</td><td class="small">' + esc(a.detail) + '</td></tr>').join('') + '</tbody></table></div><p class="note">Stock movements live in the ledger (' + S.events.length + ' events). This log covers decisions: approvals, condition changes, user and limit changes.</p></div>';
  };

  /* ---------- Users & limits ---------- */
  VIEWS.access = function (el) {
    const caps = [['tower.view', 'View control tower'], ['stores.use', 'Receive, issue, transfer'], ['request.raise', 'Raise part or AOG request'], ['rec.approve', 'Approve reorder below limit'], ['rec.approve.high', 'Second approval above limit'], ['compliance.use', 'Verify certificates, change condition'], ['supplier.portal', 'Confirm and ship own orders'], ['audit.view', 'Read audit log'], ['limit.propose', 'Propose approval limit'], ['limit.approve', 'Approve approval limit']];
    const roles = ['admin', 'operator', 'technician', 'planner', 'procurement', 'compliance', 'supplier', 'viewer'];
    const pl = S.pendingLimit;
    el.innerHTML = head('Users & limits', 'Roles, location scope and the approval limit. Changes that widen spending power need a second person.') +
      '<div class="grid g2" style="align-items:start"><div class="card"><h2>Approval limit</h2><p>Orders at or above <b class="mono">' + usd(S.limit) + '</b> need the Procurement Manager as well as the Planner.</p>' +
      (pl ? '<div class="why">Proposed change to <b class="mono">' + usd(pl.value) + '</b> by ' + esc(uname(pl.by)) + '. Waiting for the Procurement Manager.</div>' + (AV.can(user, 'limit.approve') ? '<div class="row"><button class="btn danger" data-act="limRej">Reject</button><button class="btn primary" data-act="limOk">Approve change</button></div>' : '') : '') +
      (AV.can(user, 'limit.propose') && !pl ? '<form id="limForm" class="row"><input class="inp mono" id="limV" type="number" min="500" step="500" value="' + S.limit + '" style="width:140px" aria-label="New limit in USD"><button class="btn" type="submit">Propose new limit</button></form><p class="note">The Admin cannot change this alone. Raising it would quietly remove second approvals.</p>' : '') + '</div>' +
      '<div class="card"><h2>Blocked role combinations</h2><div class="list"><div class="li"><div class="grow"><b>Admin + any approving role</b><span class="small muted">Could create a user and approve through it.</span></div></div><div class="li"><div class="grow"><b>Stores Operator + Compliance at one station</b><span class="small muted">Could receive and certify the same part.</span></div></div><div class="li"><div class="grow"><b>Planner + Procurement Manager</b><span class="small muted">Would collapse two-level approval into one person.</span></div></div></div></div></div>' +
      '<div class="card"><h2>Users</h2><div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Location scope</th><th>Login</th></tr></thead><tbody>' + AV.users.map(u => '<tr><td>' + esc(u.name) + '</td><td>' + esc(AV.roleNames[u.role]) + '</td><td class="mono small">' + (u.scope.length === 4 ? 'All stations' : u.scope.join(', ') || 'Own orders only') + '</td><td class="mono small">' + esc(u.email || '') + '</td></tr>').join('') + '</tbody></table></div></div>' +
      '<div class="card"><h2>Permissions matrix</h2><p class="note">Generated from the same rules the app enforces on every action, so the table and the behaviour cannot drift apart.</p><div class="tbl-wrap"><table><thead><tr><th>Capability</th>' + roles.map(r => '<th class="num">' + esc(AV.roleNames[r]).replace(' ', '<br>') + '</th>').join('') + '</tr></thead><tbody>' +
      caps.map(([c, l]) => '<tr><td>' + l + '</td>' + roles.map(r => '<td class="num">' + (AV.matrix[c].includes(r) ? '<b style="color:var(--ok)">Y</b>' : '<span class="muted">–</span>') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></div>';
    const lf = $('#limForm');
    if (lf) lf.addEventListener('submit', (e) => { e.preventDefault(); const v = Number($('#limV').value); if (!(v > 0) || v === S.limit) return toast('Enter a different limit.', true); call('propose_limit', { p_value: v }); });
  };

  /* ---------- actions ---------- */
  const ACT = {
    reset() { call('reset_demo', {}).then(ok => { if (ok) labCache = {}; }); },
    async signout() { if (unsub) unsub(); unsub = null; await AV.api.signOut(); user = null; history.replaceState(null, '', location.pathname); login(); },
    hist(d) { histId = d.id; go('history'); },
    findpn(d) { findPn = d.pn; findQ = ''; if (allowed('find')) go('find', true); else toast(part(d.pn).name + ': search is not part of your role.', true); },
    storeSt(d) { storeSt = d.st; lookup = ''; render(); },
    look(d) { lookup = d.id; render(); },
    tin(d) { const t = AV.transits(S).find(x => x.trf === d.trf); if (t) call('ingest', { e: { type: 'TRANSFER_IN', trf: t.trf, pn: t.items[0].pn } }, t.trf + ' received at ' + t.to + '. Stock, alerts and the reorder queue updated for everyone.'); },
    task(d) { call('send_task', { p_task: Number(d.id) }); },
    tout(d) {
      const it = S.items[d.id], to = $('#to-' + CSS.escape(d.id)).value, qEl = $('#qty-' + CSS.escape(d.id)), qty = qEl ? Number(qEl.value) : 1;
      call('ingest', { e: { type: 'TRANSFER_OUT', item: it.id, pn: it.pn, qty, from: storeSt, to } }, qty + ' × ' + part(it.pn).name + ' sent to ' + to + '.');
    },
    rcv(d) { call('receive_po', { p_po: d.id }); },
    issue(d) { call('issue_reserved', { p_item: d.id, p_req: d.req }); },
    appr(d) { const r = AV.recommend(S).find(x => x.id === d.id); if (r) call('approve_rec', { p_rec: r.id, p_pn: r.pn, p_station: r.station, p_qty: r.qty }); },
    rej(d) { call('reject_rec', { p_rec: d.id }); },
    lateral(d) {
      const r = AV.recommend(S).find(x => x.id === d.id); if (!r || !r.lateral) return;
      const q = S.requests.find(x => x.pn === r.pn && x.station === r.station && x.status === 'Open');
      call('lateral_transfer', { p_rec: r.id, p_pn: r.pn, p_from: r.lateral.code, p_to: r.station, p_qty: Math.min(r.lateral.spare, Math.max(1, q ? q.qty : 1)) });
    },
    cver(d) { const it = S.items[d.id]; call('ingest', { e: { type: 'VERIFY', item: it.id, pn: it.pn, cert: (it.cert || 'Certificate') + ' · verified' } }, it.id + ' is now serviceable.'); },
    crej(d) { const it = S.items[d.id]; call('ingest', { e: { type: 'CONDITION', item: it.id, pn: it.pn, cond: 'quarantined', reason: 'Certificate rejected at inspection' } }, it.id + ' quarantined.'); },
    release(d) { const it = S.items[d.id]; call('ingest', { e: { type: 'CONDITION', item: it.id, pn: it.pn, cond: 'serviceable', reason: 'Released after re-inspection' } }, it.id + ' released to serviceable.'); },
    scrap(d) { const it = S.items[d.id]; call('ingest', { e: { type: 'SCRAP', item: it.id, pn: it.pn, reason: 'Beyond economic repair' } }, it.id + ' scrapped.'); },
    sacc(d) { call('supplier_po', { p_po: d.id, p_action: 'accept' }); },
    sdec(d) { call('supplier_po', { p_po: d.id, p_action: 'decline' }); },
    scert(d) { call('supplier_po', { p_po: d.id, p_action: 'cert' }); },
    sship(d) { call('supplier_po', { p_po: d.id, p_action: 'ship' }); },
    labS(d) { labShift = Number(d.v); render(); },
    limOk() { call('decide_limit', { p_ok: true }); },
    limRej() { call('decide_limit', { p_ok: false }); }
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
    e.preventDefault(); ACT[a.dataset.act] && ACT[a.dataset.act](a.dataset, a);
  });

  /* ---------- scanner simulator: posts through the same server door as a real scanner ---------- */
  async function liveTick() {
    if (!liveOn || document.hidden || !user || user.role === 'supplier') return;
    const t = performance.now();
    try { const id = await AV.api.rpc('scanner_tick', {}); if (id) pendingLat[id] = t; } catch (e) { liveOn = false; toast(e.message, true); }
  }

  /* ---------- realtime: a change by anyone refreshes every open screen ---------- */
  function onChange(p) {
    if (p && p.table === 'events' && p.new && pendingLat[p.new.id] && S) {
      const l = performance.now() - pendingLat[p.new.id]; delete pendingLat[p.new.id];
      S.lastLatencies = (S.lastLatencies || []).concat(l).slice(-20);
    }
    clearTimeout(reloadT);
    reloadT = setTimeout(async () => {
      if (!user) return;
      try { await reload(); } catch (e) { return; }
      if (current === 'tower' && VIEWS.tower.refresh) return VIEWS.tower.refresh();
      const a = document.activeElement;
      if (a && a.closest && a.closest('#view') && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
      if (current !== 'find' && current !== 'lab' && current !== 'forecast') render();
    }, 300);
  }

  function login(msg) {
    const demo = [['Supply Chain Planner', 'planner'], ['Stores · LHR and DXB', 'stores.lhr'], ['Stores · SIN', 'stores.sin'], ['Stores · LOS', 'stores.los'], ['Technician · SIN', 'technician'], ['Procurement Manager', 'procurement'], ['Compliance Officer', 'compliance'], ['Supplier · Halcyon', 'supplier'], ['Admin', 'admin'], ['Super Admin', 'support'], ['Management viewer', 'finance']];
    $('#root').innerHTML = '<div class="login"><div class="lcard"><div class="lbrand">' + LOGO + '</div><div class="stack" style="gap:4px"><h1>Sign in to Avilo</h1><p class="muted">Spares control tower · capstone prototype · all data is simulated</p></div>' +
      '<form id="lf" class="stack" style="gap:12px"><div class="field"><label class="label" for="le">Email</label><input id="le" type="email" autocomplete="username" required></div><div class="field"><label class="label" for="lp">Password</label><input id="lp" type="password" autocomplete="current-password" required></div>' +
      '<p class="small" id="lerr" style="color:var(--bad);min-height:18px">' + esc(msg || '') + '</p><button class="btn primary lg" type="submit">Sign in</button></form>' +
      '<div class="stack" style="gap:6px"><span class="label">Demo accounts</span><div class="acc">' + demo.map(([r, l]) => '<button type="button" class="accb" data-email="' + l + '@avilo.test"><span>' + r + '</span><span class="mono small muted">' + l + '@avilo.test</span></button>').join('') + '</div><p class="small muted">Selecting an account fills in its email. Passwords are held by the project team.</p></div></div></div>';
    $('#lf').addEventListener('submit', async (e) => {
      e.preventDefault(); const b = e.target.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Signing in…';
      try { await AV.api.signIn($('#le').value.trim(), $('#lp').value); await start(); }
      catch (x) { const el = $('#lerr'); if (el) el.textContent = x.message; b.disabled = false; b.textContent = 'Sign in'; }
    });
    document.querySelectorAll('[data-email]').forEach(b => b.addEventListener('click', () => { $('#le').value = b.dataset.email; $('#lp').focus(); }));
  }

  async function start() {
    const sess = await AV.api.session();
    if (!sess) return login();
    try { S = await AV.api.load(sess.user.id); } catch (e) { return login('Could not load data: ' + e.message); }
    if (!S.me) { await AV.api.signOut(); return login('This account has no Avilo role.'); }
    user = S.me;
    shell();
    const h = location.hash.slice(1);
    go(allowed(h) ? h : HOME[user.role], true);
    if (unsub) unsub();
    unsub = AV.api.subscribe(onChange);
    toast('Signed in as ' + user.name + ', ' + AV.roleNames[user.role] + '.');
  }

  function boot() {
    window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (user && id && id !== current) go(id); });
    setInterval(() => { const c = $('#clk'); if (c) c.textContent = fDT(AV.clock()); }, 1000);
    liveTimer = setInterval(liveTick, 8000);
    start().catch(e => login(e.message));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
