"use client";

import { useEffect } from "react";
import { reportClient } from "~/lib/report";

// The root layout itself crashed: reported to Bugfixes. It replaces the whole page, so it
// brings its own html and body, without the app's styles.
export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		reportClient("boundary", error);
	}, [error]);
	return (
		<html lang="en">
			<body
				style={{
					fontFamily: "system-ui, sans-serif",
					maxWidth: 560,
					margin: "64px auto",
					padding: "0 24px",
				}}
			>
				<h1>Something went wrong</h1>
				<p>We've been told about it.</p>
				<button type="button" onClick={reset}>
					Try again
				</button>
			</body>
		</html>
	);
}
