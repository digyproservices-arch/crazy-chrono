/*
  Normalize image filenames to ASCII-safe slugs in public/images and update associations.json
  - Removes diacritics, replaces spaces with '-', removes unsafe chars, collapses dashes
  - Renames files in-place to safe names (or deletes original if safe duplicate already exists)
  - Updates public/data/associations.json to use images/<safe-filename>
  Idempotent: can be run multiple times safely.
*/

const fs = require('fs');
const path = require('path');

const imagesDir = path.join(process.cwd(), 'public', 'images');
const associationsPath = path.join(process.cwd(), 'public', 'data', 'associations.json');

function toAsciiSafe(name) {
  // split name and extension
  const ext = (path.extname(name) || '').toLowerCase();
  let base = path.basename(name, ext);
  // Normalize unicode to remove diacritics
  base = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Replace spaces with dashes
  base = base.replace(/\s+/g, '-');
  // Replace any remaining non-safe ASCII chars with '-'
  base = base.replace(/[^A-Za-z0-9._()-]/g, '-');
  // Collapse multiple dashes
  base = base.replace(/-+/g, '-');
  // Trim leading/trailing dashes
  base = base.replace(/^-+|-+$/g, '');
  return base + ext;
}

function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalizeFilenames() {
  ensureDirExists(imagesDir);
  const names = fs.readdirSync(imagesDir);
  let changed = 0;
  for (const name of names) {
    const full = path.join(imagesDir, name);
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    const safe = toAsciiSafe(name);
    if (safe === name) continue;
    const dest = path.join(imagesDir, safe);
    try {
      if (!fs.existsSync(dest)) {
        // Prefer rename when possible (atomic and preserves metadata)
        fs.renameSync(full, dest);
        changed++;
        console.log(`RENAMED ${name} -> ${safe}`);
      } else {
        // Safe already exists (possibly created earlier) -> delete original
        fs.unlinkSync(full);
        changed++;
        console.log(`REMOVED duplicate original ${name} (kept ${safe})`);
      }
    } catch (e) {
      console.warn(`WARN: could not normalize ${name}: ${e.message}`);
    }
  }
  return changed;
}

function updateAssociations() {
  if (!fs.existsSync(associationsPath)) {
    console.warn('No associations.json found, skipping update');
    return 0;
  }
  const raw = fs.readFileSync(associationsPath, 'utf8');
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error('ERROR: associations.json is not valid JSON');
    return 0;
  }
  if (!json || !Array.isArray(json.images)) return 0;
  let updates = 0;
  for (const img of json.images) {
    if (!img || !img.url) continue;
    const u = String(img.url).replace(/\\/g, '/');
    const fname = u.split('/').pop();
    const safe = toAsciiSafe(fname);
    const newUrl = `images/${safe}`;
    if (img.url !== newUrl) {
      img.url = newUrl;
      updates++;
    }
  }
  fs.writeFileSync(associationsPath, JSON.stringify(json, null, 2));
  return updates;
}

(function main(){
  const changed = normalizeFilenames();
  const updates = updateAssociations();
  console.log(`Done. Files changed: ${changed}, association entries updated: ${updates}`);
})();
