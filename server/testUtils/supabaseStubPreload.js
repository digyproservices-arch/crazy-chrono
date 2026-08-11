// =============================================
// CTO-003 — Stub Supabase injecté au démarrage du VRAI server.js
//
// Préchargé via NODE_OPTIONS=--require: intercepte require('@supabase/supabase-js')
// pour que le serveur démarre avec une base déterministe, en mémoire, sans
// aucun appel réseau ni Supabase de production.
//
// Les fixtures (utilisateurs par jeton + tables) sont lues depuis le fichier
// JSON désigné par CC_TEST_SUPABASE_FIXTURE. Options supportées:
//   - unique:     { table: 'colonne' }  → insert dupliqué renvoie { error: 23505 }
//   - failWrites: { table: 'message' }  → écriture renvoyant une erreur
//                 { table: { delete: 'message' } } → panne ciblée sur un verbe
//   - failReads:  { table: 'message' }  → lecture renvoyant une erreur
//
// Les pannes peuvent aussi être basculées en cours de test via le fichier
// CC_TEST_SUPABASE_CONTROL (relu à chaque requête), ce qui permet de rejouer un
// webhook après rétablissement de la base.
// =============================================

const fs = require('fs');
const Module = require('module');

const fixture = JSON.parse(fs.readFileSync(process.env.CC_TEST_SUPABASE_FIXTURE, 'utf8'));
const usersByToken = fixture.usersByToken || {};
const tables = fixture.tables || {};
const uniqueBy = fixture.unique || {};
const controlFile = process.env.CC_TEST_SUPABASE_CONTROL || '';

function faults() {
  const base = { failWrites: fixture.failWrites || {}, failReads: fixture.failReads || {} };
  if (!controlFile) return base;
  try {
    const ctl = JSON.parse(fs.readFileSync(controlFile, 'utf8'));
    return {
      failWrites: { ...base.failWrites, ...(ctl.failWrites || {}) },
      failReads: { ...base.failReads, ...(ctl.failReads || {}) },
    };
  } catch {
    return base;
  }
}

function readFault(table) {
  const msg = faults().failReads[table];
  return msg ? { data: null, error: { message: String(msg), code: 'XX000' }, count: null } : null;
}

function matches(row, filters) {
  return filters.every(({ col, op, value }) => {
    const cell = row[col];
    if (op === 'eq') return String(cell) === String(value);
    if (op === 'neq') return String(cell) !== String(value);
    if (op === 'gte') return cell >= value;
    if (op === 'lte') return cell <= value;
    if (op === 'in') return Array.isArray(value) && value.map(String).includes(String(cell));
    return true;
  });
}

function createQuery(table) {
  const filters = [];
  let headOnly = false;
  let wantCount = false;
  let limitN = null;
  let orderCol = null;
  let orderAsc = true;
  let pendingWrite = null; // { kind:'insert'|'upsert'|'delete', payload, conflictKey }

  const rows = () => {
    let out = (tables[table] || []).filter((r) => matches(r, filters));
    if (orderCol) {
      out = [...out].sort((a, b) => {
        const x = a[orderCol]; const y = b[orderCol];
        if (x === y) return 0;
        return (x > y ? 1 : -1) * (orderAsc ? 1 : -1);
      });
    }
    if (limitN !== null) out = out.slice(0, limitN);
    return out;
  };

  const applyWrite = () => {
    const list = tables[table] || (tables[table] = []);
    const declared = faults().failWrites[table];
    const failMsg = declared && typeof declared === 'object' ? declared[pendingWrite.kind] : declared;
    if (failMsg) {
      return { data: null, error: { message: String(failMsg), code: 'XX000' } };
    }
    if (pendingWrite.kind === 'delete') {
      tables[table] = list.filter((r) => !matches(r, filters));
      return { data: null, error: null };
    }
    if (pendingWrite.kind === 'update') {
      const touched = list.filter((r) => matches(r, filters));
      touched.forEach((r) => Object.assign(r, pendingWrite.payload));
      return { data: touched, error: null };
    }
    const payload = Array.isArray(pendingWrite.payload) ? pendingWrite.payload : [pendingWrite.payload];
    // La clé de conflit déclarée par l'appelant (`onConflict`) compte autant que
    // la contrainte du fixture : sans elle, un upsert dupliquerait la ligne.
    const key = uniqueBy[table] || (pendingWrite.kind === 'upsert' ? pendingWrite.conflictKey : null) || null;
    for (const row of payload) {
      if (key) {
        const existing = list.find((r) => String(r[key]) === String(row[key]));
        if (existing) {
          if (pendingWrite.kind === 'insert') {
            return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
          }
          Object.assign(existing, row);
          continue;
        }
      }
      list.push(row);
    }
    return { data: payload, error: null };
  };

  const result = () => {
    if (pendingWrite) return applyWrite();
    const fault = readFault(table);
    if (fault) return fault;
    const data = rows();
    return { data: headOnly ? null : data, error: null, count: wantCount ? data.length : null };
  };

  const q = {
    select(_cols, opts) {
      if (opts && opts.head) headOnly = true;
      if (opts && opts.count) wantCount = true;
      return q;
    },
    eq(col, value) { filters.push({ col, op: 'eq', value }); return q; },
    neq(col, value) { filters.push({ col, op: 'neq', value }); return q; },
    gte(col, value) { filters.push({ col, op: 'gte', value }); return q; },
    lte(col, value) { filters.push({ col, op: 'lte', value }); return q; },
    in(col, value) { filters.push({ col, op: 'in', value }); return q; },
    order(col, opts) { orderCol = col; orderAsc = !opts || opts.ascending !== false; return q; },
    limit(n) { limitN = n; return q; },
    range() { return q; },
    single() {
      if (pendingWrite) {
        const written = applyWrite();
        if (written.error) return Promise.resolve({ data: null, error: written.error });
        const list = Array.isArray(written.data) ? written.data : [written.data];
        return Promise.resolve({ data: list[0] || null, error: null });
      }
      const fault = readFault(table);
      if (fault) return Promise.resolve(fault);
      const data = rows();
      if (data.length !== 1) return Promise.resolve({ data: null, error: { message: 'no rows' } });
      return Promise.resolve({ data: data[0], error: null });
    },
    maybeSingle() {
      const fault = readFault(table);
      if (fault) return Promise.resolve(fault);
      const data = rows();
      return Promise.resolve({ data: data[0] || null, error: null });
    },
    insert(payload) { pendingWrite = { kind: 'insert', payload }; return q; },
    upsert(payload, opts) { pendingWrite = { kind: 'upsert', payload, conflictKey: opts?.onConflict || null }; return q; },
    update(payload) { pendingWrite = { kind: 'update', payload }; return q; },
    delete() { pendingWrite = { kind: 'delete' }; return q; },
    then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
  };
  return q;
}

// Reproduit `consume_invitation` (migration 1100) : validations puis écriture du
// rôle et marquage du token dans une seule opération indivisible — ici garantie
// par le modèle mono-thread de Node, comme le `FOR UPDATE` côté PostgreSQL.
const ASSIGNABLE_ROLES = ['admin', 'editor', 'user', 'teacher', 'cpd', 'cpc', 'rectorat'];

function consumeInvitation(args) {
  const norm = (v) => String(v || '').trim().toLowerCase();
  const token = String(args?.p_token || '').trim();
  const userId = args?.p_user_id;
  const email = norm(args?.p_email);
  if (!token || !userId || !email) return { status: 'invalid_request' };

  const invitations = tables.invitations || [];
  const inv = invitations.find((r) => String(r.token) === token);
  if (!inv) return { status: 'not_found' };
  if (inv.used) return { status: 'already_used' };
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) return { status: 'expired' };
  if (norm(inv.email) !== email) return { status: 'email_mismatch' };
  if (!ASSIGNABLE_ROLES.includes(inv.role)) return { status: 'invalid_role' };

  const profiles = tables.user_profiles || (tables.user_profiles = []);
  const existing = profiles.find((p) => String(p.id) === String(userId));
  if (existing) {
    existing.role = inv.role;
    if (inv.region) existing.region = inv.region;
    if (inv.circonscription_id) existing.circonscription_id = inv.circonscription_id;
  } else {
    profiles.push({
      id: userId,
      role: inv.role,
      region: inv.region || null,
      circonscription_id: inv.circonscription_id || null,
    });
  }
  inv.used = true;
  inv.used_at = new Date().toISOString();
  return {
    status: 'ok',
    role: inv.role,
    region: inv.region || null,
    circonscription_id: inv.circonscription_id || null,
  };
}

function createClient() {
  return {
    auth: {
      getUser: async (token) => {
        const user = usersByToken[String(token || '')];
        if (!user) return { data: { user: null }, error: { message: 'invalid token' } };
        return { data: { user }, error: null };
      },
      admin: {
        listUsers: async () => {
          const fault = faults().failReads['auth.users'];
          if (fault) return { data: null, error: { message: String(fault), code: 'XX000' } };
          const extra = fixture.authOnlyUsers || [];
          return { data: { users: [...Object.values(usersByToken), ...extra] }, error: null };
        },
        getUserById: async (id) => {
          const user = Object.values(usersByToken).find((u) => u.id === id) || null;
          return { data: { user }, error: user ? null : { message: 'not found' } };
        },
      },
    },
    from: (table) => createQuery(table),
    rpc: async (fn, args) => {
      const fault = faults().failWrites[`rpc:${fn}`];
      if (fault) return { data: null, error: { message: String(fault), code: 'XX000' } };
      if (fn === 'consume_invitation') return { data: consumeInvitation(args), error: null };
      return { data: null, error: null };
    },
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }) }) },
  };
}

const original = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === '@supabase/supabase-js') return { createClient };
  return original.apply(this, [request, parent, isMain]);
};
