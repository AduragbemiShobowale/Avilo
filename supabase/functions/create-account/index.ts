// Issues the login for an approved account request. Runs on the server because creating an
// Auth user needs the service-role key, which must never reach the browser.
// Checks: the caller is an active Admin, the request is a 'create' request and is Approved
// (the Procurement Manager has already agreed if the role is high-risk), and the e-mail is free.
// Returns a one-time temporary password; the person must choose their own at first sign-in.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function tempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return 'Avl-' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' })
  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!jwt) return reply(401, { error: 'Sign in first.' })
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: who, error: whoErr } = await admin.auth.getUser(jwt)
    if (whoErr || !who?.user) return reply(401, { error: 'Your session has expired. Sign in again.' })

    const { data: me } = await admin.from('profiles').select('id, name, role, active').eq('id', who.user.id).maybeSingle()
    if (!me || !me.active || me.role !== 'admin') return reply(403, { error: 'Only the Admin can create accounts.' })

    const { request_id } = await req.json().catch(() => ({}))
    const { data: q } = await admin.from('account_requests').select('*').eq('id', request_id).maybeSingle()
    if (!q || q.kind !== 'create') return reply(404, { error: 'No such account request.' })
    if (q.status !== 'Approved') return reply(409, { error: q.status === 'Awaiting approval' ? 'The Procurement Manager has not approved this account yet.' : `This request is ${q.status.toLowerCase()}.` })

    const password = tempPassword()
    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email: q.email, password, email_confirm: true, user_metadata: { name: q.name } })
    if (cErr || !created?.user) return reply(400, { error: cErr?.message || 'Could not create the login.' })

    const handle = 'u-' + created.user.id.slice(0, 8)
    const { error: pErr } = await admin.from('profiles').insert({
      id: created.user.id, handle, name: q.name, role: q.role, scope: q.scope, supplier: q.supplier, email: q.email,
      active: true, must_change_password: true, created_by: me.id,
    })
    if (pErr) { await admin.auth.admin.deleteUser(created.user.id); return reply(400, { error: pErr.message }) }

    await admin.from('account_requests').update({ status: 'Done', done_at: new Date().toISOString(), target: created.user.id }).eq('id', q.id)
    await admin.from('audit').insert({ by_user: me.id, action: 'Created account', object: q.email, detail: `${q.role} · temporary password issued, must be changed at first sign-in` })
    return reply(200, { email: q.email, name: q.name, role: q.role, password })
  } catch (e) {
    return reply(500, { error: (e as Error).message || 'Unexpected error.' })
  }
})
