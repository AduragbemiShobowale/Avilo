import { createClient } from '@supabase/supabase-js'

// Publishable values: safe to ship to the browser. Access is enforced by row-level
// security and the database functions, not by hiding these. Defaults point at the
// Avilo project; override with .env.local to use another project.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://xvpcerlcysvnhuxziilt.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2cGNlcmxjeXN2bmh1eHppaWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0OTQxODQsImV4cCI6MjExMDA3MDE4NH0.5kf_G4M_-CPtdjV-TQG2v53H0VoIqTAwNbefIVrwRSU'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

// Call a database function and turn its error into a plain message.
export async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args || {})
  if (error) throw new Error(error.message || 'Something went wrong.')
  return data
}

// Read a whole table in pages of 1,000 rows (the API's default limit).
export async function readAll(table, order, ascending = true) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending }).range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...data)
    if (data.length < 1000) return out
  }
}
