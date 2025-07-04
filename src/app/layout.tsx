import "~/styles/globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { Inter as FontSans } from "next/font/google";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import ClientProvider from "~/components/ClientProvider";
import { TooltipProvider } from "~/components/ui/tooltip";
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
					<ClientProvider>
						<TooltipProvider>
							<div
								className={"relative flex min-h-screen flex-col bg-muted/49"}
							>
								<div className={"flex size-full flex-col sm:py-2"}>
									<div>HEADER</div>
									<main
										className={"size-full flex-1 p-2 pb-0"}
										suppressHydrationWarning
									>
										{children}
									</main>
								</div>
							</div>
							<Toaster />
						</TooltipProvider>
					</ClientProvider>
				</body>
			</html>
		</ClerkProvider>
	);
}
