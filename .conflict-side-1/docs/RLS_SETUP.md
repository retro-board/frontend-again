# Row Level Security (RLS) Setup with Clerk Authentication

## Overview
This application uses Clerk for authentication and Supabase for the database. We've implemented a hybrid approach that allows Clerk-authenticated users to benefit from Supabase's Row Level Security (RLS) policies.

## How It Works

### 1. Authentication Flow
- Users authenticate via Clerk
- When accessing Supabase, we generate a custom JWT token using the Clerk user ID
- This JWT is used to create an authenticated Supabase client
- RLS policies check against the `clerk_id` field in the users table

### 2. Key Components

#### `/src/lib/supabase/server.ts`
Creates authenticated Supabase clients for server-side use:
- Generates JWT tokens with Clerk user IDs
- Auto-creates users in Supabase if they don't exist
- Returns a Supabase client that respects RLS policies

#### `/src/lib/supabase/admin.ts`
Admin client with service role key:
- Bypasses RLS policies
- Used for operations that need elevated privileges
- Should be used sparingly (e.g., for creating default columns)

### 3. RLS Policies
The following policies are implemented:

#### Users Table
- Users can only update their own profile
- Users can view all user profiles (for collaboration features)

#### Boards Table
- Users can create boards (automatically become owner)
- Users can view boards they own or participate in
- Users can only update/delete their own boards

#### Board Participants Table
- Participants can view other participants in boards they're part of
- Board owners can add/remove participants
- Users can remove themselves from boards

## Environment Variables Required

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase-dashboard
```

To get your `SUPABASE_JWT_SECRET`:
1. Go to your Supabase Dashboard
2. Navigate to Settings > API
3. Copy the JWT Secret value

## Migration Steps

1. Add the JWT secret to your `.env.local` file
2. Run the RLS migration:
   ```bash
   npx supabase db push --db-url "your-database-url"
   ```
   Or apply via Supabase Dashboard SQL editor

3. Test the implementation

## API Route Pattern

For authenticated operations:
```typescript
import { createAuthenticatedSupabaseClient } from "~/lib/supabase/server";

const supabase = await createAuthenticatedSupabaseClient();
// Now all queries respect RLS policies
const { data, error } = await supabase
  .from("boards")
  .select("*");
```

For admin operations (use sparingly):
```typescript
import { supabaseAdmin } from "~/lib/supabase/admin";

// Bypasses RLS - only for trusted operations
const { data, error } = await supabaseAdmin
  .from("columns")
  .insert(defaultColumns);
```

## Testing RLS Policies

To verify RLS is working:

1. Create a board as User A
2. Try to access it as User B (should fail)
3. Add User B as a participant
4. User B should now have access
5. User B shouldn't be able to delete the board (only User A can)

## Troubleshooting

### "Permission denied" errors
- Ensure the user exists in the Supabase users table
- Check that the JWT secret is correctly configured
- Verify the RLS policies are enabled on the tables

### User not found
- The `createAuthenticatedSupabaseClient` function auto-creates users
- If issues persist, check Clerk webhook configuration

### Anonymous users
- Anonymous users still use the admin client
- Consider implementing separate RLS policies for anonymous access