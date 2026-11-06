"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "~/components/ui/button";

export function UserNav() {
	return (
		<>
			<Show when="signed-out">
				<SignInButton>
					<Button variant="outline" className={"cursor-pointer"}>
						Sign In
					</Button>
				</SignInButton>
			</Show>
			<Show when="signed-in">
				<Link href="/settings">
					<Button variant="ghost" size="sm">
						Settings
					</Button>
				</Link>
				<UserButton />
			</Show>
		</>
	);
}
