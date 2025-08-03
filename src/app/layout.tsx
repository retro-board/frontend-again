import { ClerkProvider } from "@clerk/nextjs";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { Inter as FontSans } from "next/font/google";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import ClientProvider from "~/components/ClientProvider";
import HeaderBar from "~/components/HeaderBar";
import { TooltipProvider } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

import "~/styles/globals.css";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";
import { ourFileRouter } from "~/app/api/uploadthing/core";

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
							<NextSSRPlugin
								routerConfig={extractRouterConfig(ourFileRouter)}
							/>
							<div
								className={"relative flex min-h-screen flex-col bg-muted/49"}
							>
								<div className={"flex size-full flex-col sm:py-2"}>
									<HeaderBar />
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
