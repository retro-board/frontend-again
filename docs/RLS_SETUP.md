# Historical Supabase configuration

This document applied to the previous backend. The active app uses server-only PostgreSQL queries and authenticated SSE backed by Redis/Valkey. Clerk and anonymous session cookies identify callers; API routes check ownership and membership before serving data or delivering realtime events.

Follow [Railway setup and cutover](RAILWAY_MIGRATION.md). The old Supabase JWT factory, browser database client and realtime SDK have been removed. Do not apply the historical Supabase RLS migrations to the Railway database.
