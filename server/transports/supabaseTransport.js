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
    this._flush();
  }
}

module.exports = SupabaseTransport;
