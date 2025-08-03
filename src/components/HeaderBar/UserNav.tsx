"use client"

import {SignedIn, SignedOut, SignInButton, UserButton} from "@clerk/nextjs";
import {Button} from "~/components/ui/button";

export function UserNav() {
  return (
    <>
      <SignedOut>
        <SignInButton>
          <Button variant="outline" className={"cursor-pointer"}>Sign In</Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </>
  )
}