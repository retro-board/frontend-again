"use client"

import {SignedOut, SignInButton, SignedIn, UserButton} from "@clerk/nextjs";

export function UserNav() {
  return (
    <>
      <SignedOut>
        <SignInButton className={"cursor-pointer"} />
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </>
  )
}