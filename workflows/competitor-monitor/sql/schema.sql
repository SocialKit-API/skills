-- Run once on a dedicated PostgreSQL database/schema using the monitor's role.
-- Prefix isolates these tables from n8n's own internal database tables.
CREATE TABLE IF NOT EXISTS sk_monitor_state (
  destination text PRIMARY KEY,
  lease_owner text,
  lease_until timestamptz,
  outbox jsonb
);
CREATE TABLE IF NOT EXISTS sk_monitor_delivered (
  destination text NOT NULL REFERENCES sk_monitor_state(destination),
  content_id text NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  digest_id text NOT NULL,
  slack_ts text NOT NULL,
  PRIMARY KEY (destination, content_id)
);

CREATE OR REPLACE FUNCTION sk_monitor_claim(dest text, owner text)
RETURNS TABLE(destination text, lease_owner text, outbox jsonb)
LANGUAGE sql AS $$
  INSERT INTO sk_monitor_state AS s (destination, lease_owner, lease_until)
  VALUES (dest, owner, now() + interval '15 minutes')
  ON CONFLICT (destination) DO UPDATE
    SET lease_owner = excluded.lease_owner, lease_until = excluded.lease_until
    WHERE s.lease_until IS NULL OR s.lease_until < now()
  RETURNING s.destination, s.lease_owner, s.outbox;
$$;

CREATE OR REPLACE FUNCTION sk_monitor_stage(dest text, owner text, report jsonb)
RETURNS TABLE(destination text, lease_owner text, outbox jsonb)
LANGUAGE plpgsql AS $$
DECLARE state sk_monitor_state%ROWTYPE; new_items jsonb;
BEGIN
  SELECT * INTO state FROM sk_monitor_state s WHERE s.destination = dest FOR UPDATE;
  IF state.lease_owner IS DISTINCT FROM owner OR state.lease_until < now() + interval '60 seconds' THEN
    RAISE EXCEPTION 'Monitor lease unavailable or too close to expiration';
  END IF;
  IF state.outbox IS NULL THEN
    SELECT coalesce(jsonb_agg(item ORDER BY item->>'id'), '[]'::jsonb) INTO new_items
    FROM (SELECT DISTINCT ON (item->>'id') item
      FROM jsonb_array_elements(report->'profiles') AS profile,
           jsonb_array_elements(profile->'items') AS item
      WHERE NOT EXISTS (SELECT 1 FROM sk_monitor_delivered d
        WHERE d.destination = dest AND d.content_id = item->>'id')) AS fresh;
    IF jsonb_array_length(new_items) > 0 THEN
      UPDATE sk_monitor_state s SET outbox = jsonb_build_object(
        'digestId', owner, 'schemaVersion', '1.0.0', 'items', new_items,
        'collectedAt', report->>'completedAt', 'profiles', report->'profiles', 'usage', report->'usage')
      WHERE s.destination = dest;
    ELSE
      UPDATE sk_monitor_state s SET lease_owner = NULL, lease_until = NULL WHERE s.destination = dest;
    END IF;
  END IF;
  RETURN QUERY SELECT s.destination, s.lease_owner, s.outbox FROM sk_monitor_state s WHERE s.destination = dest;
END;
$$;

CREATE OR REPLACE FUNCTION sk_monitor_guard(dest text, owner text)
RETURNS TABLE(destination text, lease_owner text, outbox jsonb)
LANGUAGE sql AS $$
  SELECT s.destination, s.lease_owner, s.outbox FROM sk_monitor_state s
  WHERE s.destination = dest AND s.lease_owner = owner AND s.lease_until > now() + interval '60 seconds' AND s.outbox IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION sk_monitor_ack(dest text, owner text, digest text, slack_timestamp text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE state sk_monitor_state%ROWTYPE; delivered_count integer;
BEGIN
  SELECT * INTO state FROM sk_monitor_state s WHERE s.destination = dest FOR UPDATE;
  IF state.lease_owner IS DISTINCT FROM owner OR state.lease_until < now() OR state.outbox->>'digestId' IS DISTINCT FROM digest OR slack_timestamp = '' THEN
    RAISE EXCEPTION 'Cannot acknowledge: lease, digest, or Slack confirmation mismatch';
  END IF;
  INSERT INTO sk_monitor_delivered(destination, content_id, digest_id, slack_ts)
    SELECT dest, item->>'id', digest, slack_timestamp FROM jsonb_array_elements(state.outbox->'items') AS item
    ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS delivered_count = ROW_COUNT;
  UPDATE sk_monitor_state s SET outbox = NULL, lease_owner = NULL, lease_until = NULL WHERE s.destination = dest;
  RETURN delivered_count;
END;
$$;
