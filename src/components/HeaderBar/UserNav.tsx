"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "~/components/ui/button";

export function UserNav() {
	return (
		<>
			<SignedOut>
				<SignInButton>
					<Button variant="outline" className={"cursor-pointer"}>
						Sign In
					</Button>
				</SignInButton>
			</SignedOut>
			<SignedIn>
				<Link href="/settings">
					<Button variant="ghost" size="sm">
						Settings
					</Button>
				</Link>
				<UserButton />
			</SignedIn>
		</>
	);
}
