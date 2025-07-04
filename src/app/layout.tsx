import "~/styles/globals.css";

import {
	ClerkProvider,
	SignedIn,
	SignedOut,
	SignInButton,
	UserButton,
} from "@clerk/nextjs";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { Inter as FontSans } from "next/font/google";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

export const metadata: Metadata = {
	title: "Retro-Board",
	description: "Retro Board",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const fontSans = FontSans({
	subsets: ["latin"],
	variable: "--font-sans",
});

export default function RootLayout({
	children,
}: Readonly<{ children: ReactNode }>) {
	return (
		<ClerkProvider>
			<html
				lang="en"
				className={`${GeistSans.variable}`}
				suppressHydrationWarning
			>
				<body
					className={cn(
						"min-h-screen bg-background font-sans antialiased",
						fontSans.variable,
					)}
				>
					<SignedOut>
						<SignInButton />
					</SignedOut>
					<SignedIn>
						<UserButton />
					</SignedIn>
					{children}
				</body>
			</html>
		</ClerkProvider>
	);
}
