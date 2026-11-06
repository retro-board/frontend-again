"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { useFlags } from "@flags-gg/react-library";
import Link from "next/link";
import { Button } from "~/components/ui/button";

export function UserNav() {
	const { is } = useFlags();
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
				{is("settings").enabled() && (
					<Link href="/settings">
						<Button variant="ghost" size="sm">
							Settings
						</Button>
					</Link>
				)}
				<UserButton />
			</Show>
		</>
	);
}
