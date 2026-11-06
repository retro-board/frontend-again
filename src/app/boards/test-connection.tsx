"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export default function TestConnection() {
	const { user, isLoaded } = useUser();
	const [status, setStatus] = useState<string>("Testing connection...");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function testConnection() {
			try {
				// Wait for Clerk to load
				if (!isLoaded) {
					setStatus("Waiting for authentication to load...");
					return;
				}

				if (user) {
					const response = await fetch("/api/users/current", {
						method: "POST",
					});
					if (!response.ok) throw new Error("Backend connection failed");
					setStatus("Connected to backend");
				} else setStatus("Sign in to test the backend connection");
			} catch (err) {
				setError(`Unexpected error: ${err}`);
			}
		}

		testConnection();
	}, [user, isLoaded]);

	return (
		<div className="container mx-auto p-8">
			<h1 className="mb-4 font-bold text-2xl">Backend Connection Test</h1>
			<p className="mb-2">Status: {status}</p>
			{error && <p className="text-red-500">Error: {error}</p>}
			{user && (
				<div className="mt-4">
					<p>Clerk User ID: {user.id}</p>
					<p>Email: {user.emailAddresses[0]?.emailAddress}</p>
				</div>
			)}
		</div>
	);
}
