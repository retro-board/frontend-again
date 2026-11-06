"use client";

import { FlagsProvider } from "@flags-gg/react-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { type ReactNode, useEffect, useState } from "react";
import { env, flagConfig } from "~/env";
import { reportClient } from "~/lib/report";

export default function ClientProvider({ children }: { children: ReactNode }) {
	const { theme } = useTheme();
	const [queryClient] = useState(() => new QueryClient());

	// uncaught browser errors and rejections go to Bugfixes via /api/client-errors
	useEffect(() => {
		const onError = (e: ErrorEvent) =>
			reportClient("error", e.error ?? e.message);
		const onRejection = (e: PromiseRejectionEvent) =>
			reportClient("rejection", e.reason);
		window.addEventListener("error", onError);
		window.addEventListener("unhandledrejection", onRejection);
		return () => {
			window.removeEventListener("error", onError);
			window.removeEventListener("unhandledrejection", onRejection);
		};
	}, []);

	// || not ??: an empty build arg should still fall back to the default environment
	const flagsConfig = {
		...flagConfig,
		environmentId:
			env.NEXT_PUBLIC_FLAGS_ENVIRONMENT || flagConfig.environmentId,
	};

	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider
				defaultTheme={theme}
				enableSystem
				disableTransitionOnChange
				attribute={"class"}
			>
				<FlagsProvider options={flagsConfig}>{children}</FlagsProvider>
			</ThemeProvider>
		</QueryClientProvider>
	);
}
