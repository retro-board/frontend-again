"use client";

import { FlagsProvider } from "@flags-gg/react-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { type ReactNode, useState } from "react";
import { env, flagConfig } from "~/env";

export default function ClientProvider({ children }: { children: ReactNode }) {
	const { theme } = useTheme();
	const [queryClient] = useState(() => new QueryClient());

	const flagsConfig = flagConfig;
	flagsConfig.environmentId =
		env.NEXT_PUBLIC_FLAGS_ENVIRONMENT ?? flagConfig.environmentId;

	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider
				defaultTheme={theme}
				enableSystem
				disableTransitionOnChange
				attribute={"class"}
			>
				<FlagsProvider options={flagsConfig ?? flagsConfig}>
					{children}
				</FlagsProvider>
			</ThemeProvider>
		</QueryClientProvider>
	);
}
