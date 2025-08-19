-- Temporarily disable RLS on users table to allow user creation
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Keep RLS enabled on other tables
-- We'll re-enable RLS on users table after we fix the policies