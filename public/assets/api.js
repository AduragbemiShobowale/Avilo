/* Avilo data layer: Supabase auth, data loading, server functions and realtime. */
(function () {
  const AV = window.AV, C = window.AVILO_CONFIG;
  const sb = window.supabase.createClient(C.url, C.key, { auth: { persistSession: true, autoRefreshToken: true } });
  AV.clock = () => Date.now();
  const ms = (t) => (t ? Date.parse(t) : null);

  async function all(table, order, asc) {
    const out = []; const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await sb.from(table).select('*').order(order, { ascending: asc !== false }).range(from, from + page - 1);
      if (error) throw new Error(error.message);
      out.push(...data);
      if (data.length < page) return out;
    }
  }

  AV.api = {
    sb,
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw new Error(error.message === 'Invalid login credentials' ? 'That email and password do not match a demo account.' : error.message); },
    async signOut() { await sb.auth.signOut(); },
    async rpc(fn, args) { const { data, error } = await sb.rpc(fn, args || {}); if (error) throw new Error(error.message); return data; },

    async load(uid) {
      const [profiles, events, requests, pos, decisions, tasks, audit, settings] = await Promise.all([
        all('profiles', 'name'), all('events', 'id'), all('requests', 'ts'), all('pos', 'id'),
        all('rec_decisions', 'updated_at'), all('tasks', 'id'), all('audit', 'id'), all('settings', 'key')
      ]);
      AV.users = profiles.map(p => ({ id: p.id, handle: p.handle, name: p.name, role: p.role, scope: p.scope || [], supplier: p.supplier, email: p.email }));
      AV.userBy = Object.fromEntries(AV.users.map(u => [u.id, u]));
      const S = {
        events: events.map(e => ({ id: 'EV-' + String(e.id).padStart(5, '0'), dbid: e.id, ts: ms(e.ts), type: e.type, item: e.item, pn: e.pn, qty: e.qty == null ? null : Number(e.qty), from: e.from_st, to: e.to_st, trf: e.trf, ref: e.ref, aircraft: e.aircraft, cond: e.cond, cert: e.cert, reason: e.reason, expiry: ms(e.expiry), actor: e.actor, source: e.source })),
        requests: requests.map(r => ({ id: r.id, pn: r.pn, qty: r.qty, station: r.station, aircraft: r.aircraft, wo: r.wo, priority: r.priority, status: r.status, by: r.by_user, ts: ms(r.ts), note: r.note })),
        pos: pos.map(o => ({ id: o.id, sup: o.sup, pn: o.pn, qty: o.qty, station: o.station, value: Number(o.value), status: o.status, sent: ms(o.sent), promised: ms(o.promised), shipped: ms(o.shipped), received: ms(o.received), tracking: o.tracking, approvals: (o.approvals || []).map(a => ({ by: a.by, ts: ms(a.ts) })), aog: o.aog, note: o.note, certUploaded: o.cert_uploaded })),
        recDecisions: Object.fromEntries(decisions.map(d => [d.id, { status: d.status, approvals: (d.approvals || []).map(a => ({ by: a.by, ts: ms(a.ts) })), po: d.po, note: d.note, raisedBy: d.raised_by }])),
        tasks: tasks.map(t => ({ id: t.id, pn: t.pn, qty: t.qty, from: t.from_st, to: t.to_st, req: t.req, status: t.status, why: t.why })),
        audit: audit.map(a => ({ ts: ms(a.ts), by: a.by_user, action: a.action, object: a.object, detail: a.detail })),
        limit: 5000, pendingLimit: null
      };
      for (const s of settings) {
        if (s.key === 'limit') S.limit = Number(s.value);
        if (s.key === 'pending_limit') S.pendingLimit = { value: Number(s.value.value), by: s.value.by };
      }
      S.items = AV.project(S.events);
      S.me = AV.userBy[uid] || null;
      return S;
    },

    subscribe(onChange) {
      const ch = sb.channel('avilo-db').on('postgres_changes', { event: '*', schema: 'public' }, onChange).subscribe();
      return () => sb.removeChannel(ch);
    }
  };
})();
