// ==========================================
// WINSTON SUPABASE TRANSPORT
// Transport custom Winston pour logs persistants en DB
// ==========================================

const Transport = require('winston-transport');

class SupabaseTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.supabase = opts.supabase;
    this._buffer = [];
    this._flushSize = opts.flushSize || 20;
    this._flushIntervalMs = opts.flushIntervalMs || 5000;
    this._flushing = false;
    
    if (!this.supabase) {
      throw new Error('SupabaseTransport requires a supabase client');
    }

    // Periodic flush
    this._timer = setInterval(() => this._flush(), this._flushIntervalMs);
    // Ensure flush on process exit
    process.on('beforeExit', () => this._flush());

    // ── Purge automatique quotidienne ──
    // La table backend_logs avait atteint 1,4M lignes (0,89 GB) et fait dépasser
    // le quota Supabase free (0,5 GB) → requêtes API restreintes, monitoring KO.
    // Rétention par défaut: 14 jours (le rapport monitoring ne lit que 48h).
    this._retentionDays = parseInt(process.env.BACKEND_LOGS_RETENTION_DAYS || '14', 10);
    if (this._retentionDays > 0) {
      // 1er passage 2 min après le démarrage, puis toutes les 24h
      this._purgeStartTimer = setTimeout(() => {
        this._purgeOldLogs();
        this._purgeTimer = setInterval(() => this._purgeOldLogs(), 24 * 60 * 60 * 1000);
      }, 2 * 60 * 1000);
    }
  }

  async _purgeOldLogs() {
    try {
      const cutoff = new Date(Date.now() - this._retentionDays * 24 * 60 * 60 * 1000).toISOString();
      const { error, count } = await this.supabase
        .from('backend_logs')
        .delete({ count: 'exact' })
        .lt('timestamp', cutoff);
      if (error) {
        console.error('[SupabaseTransport] Purge error:', error.message);
      } else {
        console.log(`[SupabaseTransport] 🧹 Purge logs > ${this._retentionDays}j: ${count || 0} ligne(s) supprimée(s)`);
      }
    } catch (err) {
      console.error('[SupabaseTransport] Purge exception:', err.message);
    }
  }

  async log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    const { level, message, timestamp, ...meta } = info;
    this._buffer.push({
      level,
      message,
      timestamp: timestamp || new Date().toISOString(),
      meta: Object.keys(meta).length > 0 ? meta : {}
    });

    if (this._buffer.length >= this._flushSize) {
      this._flush();
    }

    callback();
  }

  async _flush() {
    if (this._flushing || this._buffer.length === 0) return;
    this._flushing = true;

    const batch = this._buffer.splice(0, this._flushSize);
    try {
      const { error } = await this.supabase
        .from('backend_logs')
        .insert(batch);
      
      if (error) {
        console.error(`[SupabaseTransport] Batch insert error (${batch.length} rows):`, error.message);
        // Re-queue failed items (prepend, capped to avoid memory leak)
        this._buffer.unshift(...batch);
        if (this._buffer.length > 500) this._buffer.splice(0, this._buffer.length - 500);
      }
    } catch (err) {
      console.error('[SupabaseTransport] Flush error:', err.message);
      this._buffer.unshift(...batch);
      if (this._buffer.length > 500) this._buffer.splice(0, this._buffer.length - 500);
    } finally {
      this._flushing = false;
    }
  }

  close() {
    clearInterval(this._timer);
    if (this._purgeStartTimer) clearTimeout(this._purgeStartTimer);
    if (this._purgeTimer) clearInterval(this._purgeTimer);
    this._flush();
  }
}

module.exports = SupabaseTransport;
