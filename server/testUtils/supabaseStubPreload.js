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
// =============================================

const fs = require('fs');
const Module = require('module');

const fixture = JSON.parse(fs.readFileSync(process.env.CC_TEST_SUPABASE_FIXTURE, 'utf8'));
const usersByToken = fixture.usersByToken || {};
const tables = fixture.tables || {};
const uniqueBy = fixture.unique || {};
const failWrites = fixture.failWrites || {};

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
  let pendingWrite = null; // { kind:'insert'|'upsert'|'delete', payload }

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
    if (failWrites[table]) {
      return { data: null, error: { message: String(failWrites[table]), code: 'XX000' } };
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
    const key = uniqueBy[table] || null;
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
      const data = rows();
      if (data.length !== 1) return Promise.resolve({ data: null, error: { message: 'no rows' } });
      return Promise.resolve({ data: data[0], error: null });
    },
    maybeSingle() {
      const data = rows();
      return Promise.resolve({ data: data[0] || null, error: null });
    },
    insert(payload) { pendingWrite = { kind: 'insert', payload }; return q; },
    upsert(payload) { pendingWrite = { kind: 'upsert', payload }; return q; },
    update(payload) { pendingWrite = { kind: 'update', payload }; return q; },
    delete() { pendingWrite = { kind: 'delete' }; return q; },
    then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
  };
  return q;
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
        listUsers: async () => ({ data: { users: Object.values(usersByToken) }, error: null }),
        getUserById: async (id) => {
          const user = Object.values(usersByToken).find((u) => u.id === id) || null;
          return { data: { user }, error: user ? null : { message: 'not found' } };
        },
      },
    },
    from: (table) => createQuery(table),
    rpc: async () => ({ data: null, error: null }),
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }) }) },
  };
}

const original = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === '@supabase/supabase-js') return { createClient };
  return original.apply(this, [request, parent, isMain]);
};
