# Railway setup and Supabase cutover

Provision the Next.js service, PostgreSQL and Redis/Valkey in the same Railway project and environment. Add `DATABASE_URL` and `REDIS_URL` to the app using the database services' reference variables. Keep Clerk, UploadThing and feature flag variables from the existing app. No separate websocket server is required.

The application serves authenticated SSE at `/api/realtime/:channel`. Every stream checks membership using Clerk or the existing anonymous session cookie. PostgreSQL stores application data and poker timer/voting state. Redis streams retain approximately 1,000 events per channel for up to 12 hours after the latest event. SSE sends heartbeats every 15 seconds and presence entries expire when a connection stops refreshing. Registered users, anonymous users and multiple app replicas share the same database and Redis service.

Board streams resume from `Last-Event-ID`; poker streams recover a fresh state snapshot and then follow new events. Persistent API queries refresh after reconnection. Redis history can be discarded without losing PostgreSQL data or poker controls. Configure a persistent Redis volume if retaining event history across Redis restarts matters.

## Existing data

The automatic migrations initialize an empty ordinary PostgreSQL database. They do not connect to Supabase or copy existing data. Keep the old service running until the copy has been verified. Use a separate staging database to rehearse the import first.

1. Create an empty target PostgreSQL database. Run `bun run db:migrate` with its `DATABASE_URL`.
2. Pause writes on the old app before the final export. Take a backup of the source.
3. Export **data only** for the application tables listed below, using a direct PostgreSQL connection to Supabase. Do not export the Supabase `auth`, `storage`, realtime schemas, public schema DDL, RLS policies or role grants.
4. Restore the data into the initialized target using `pg_restore --data-only --disable-triggers --no-owner --no-acl --exit-on-error --single-transaction`. Use a database owner with permission to disable triggers. Disabling triggers is needed for the cyclic boards/cards highlighting foreign keys; restore only a trusted backup. Do not restore into a target containing application data.
5. Compare table row counts and check registered and anonymous board joins, masked cards, votes, highlights, poker stories and estimates. Confirm imported highlighted cards and current stories refer to the correct board/session. Verify foreign-key consistency after the import because triggers were disabled during restoration.
6. Set the app's Railway reference variables to the target services and deploy this revision. The pre-deploy command applies any unapplied migrations. Check collaboration from two browser sessions and reconnect one of them.
7. Keep the source backup and the old app configuration available until the cutover is accepted. Remove Supabase variables from the new app once it is working.

Application tables:

```text
users
anonymous_users
boards
columns
cards
card_votes
board_participants
board_anonymous_participants
poker_sessions
stories
poker_votes
poker_participants
poker_anonymous_participants
linked_cards
```

For `pg_dump`, use `--format=custom --data-only --no-owner --no-acl` and an explicit `--table=public.<name>` for each application table above. PostgreSQL COPY statements include their column lists, so new columns such as `is_voting` retain their defaults when absent in the source. Check the live source schema for additional columns or tables before the final export; the repository's historical migrations may not reflect manual production schema changes.

If rolling back, pause writes before switching the app back. Writes made in the Railway database after cutover are not automatically copied to Supabase.
