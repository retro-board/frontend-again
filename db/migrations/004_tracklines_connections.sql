-- RB-3: a retro-board user's connection to TrackLin.es. One per user (no orgs yet).
-- The service key and webhook signing secret are AES-256-GCM sealed (src/lib/tracklines/security.ts).
CREATE TABLE tracklines_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- in the webhook URL, to find the secret
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  service_key TEXT NOT NULL,
  webhook_id TEXT,
  webhook_secret TEXT,
  webhook_error TEXT, -- why TrackLin.es refused the webhook; retros then aren't made automatically
  needs_reconnect BOOLEAN NOT NULL DEFAULT false, -- TrackLin.es said 401/403 to the key
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
