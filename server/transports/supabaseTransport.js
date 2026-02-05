// ==========================================
// WINSTON SUPABASE TRANSPORT
// Transport custom Winston pour logs persistants en DB
// ==========================================

const Transport = require('winston-transport');

class SupabaseTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.supabase = opts.supabase;
    
    if (!this.supabase) {
      throw new Error('SupabaseTransport requires a supabase client');
    }
  }

  async log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    try {
      const { level, message, timestamp, ...meta } = info;
      
      // Insérer le log dans Supabase
      const { error } = await this.supabase
        .from('backend_logs')
        .insert({
          level,
          message,
          timestamp: timestamp || new Date().toISOString(),
          meta: Object.keys(meta).length > 0 ? meta : {}
        });
      
      if (error) {
        console.error('[SupabaseTransport] Error inserting log:', error);
      }
      
      callback();
    } catch (err) {
      console.error('[SupabaseTransport] Error:', err);
      callback(err);
    }
  }
}

module.exports = SupabaseTransport;
