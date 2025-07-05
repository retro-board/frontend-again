"use client"

import {SignedOut, SignInButton, SignedIn, UserButton} from "@clerk/nextjs";

export function UserNav() {
  return (
    <>
      <SignedOut>
        <SignInButton />
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </>
  )
}