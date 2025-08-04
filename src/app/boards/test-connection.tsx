"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { supabase } from "~/lib/supabase/client";

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

				// Test basic connection
				const { data, error } = await supabase
					.from("users")
					.select("count")
					.limit(1);

				if (error) {
					setError(`Connection error: ${error.message}`);
					setStatus("Connection failed");
					return;
				}

				setStatus("Connected to Supabase!");

				// Test user creation if logged in
				if (user) {
					const { data: existingUser, error: fetchError } = await supabase
						.from("users")
						.select("*")
						.eq("clerk_id", user.id)
						.maybeSingle(); // Use maybeSingle() to handle no rows

					if (fetchError) {
						setError(`User fetch error: ${fetchError.message}`);
						return;
					}

					if (!existingUser) {
						const { error: insertError } = await supabase.from("users").insert({
							clerk_id: user.id,
							email: user.emailAddresses[0]?.emailAddress ?? "",
							name: user.fullName ?? user.username ?? "",
							avatar_url: user.imageUrl,
						});

						if (insertError) {
							setError(`User creation error: ${insertError.message}`);
							return;
						}

						setStatus("User created successfully!");
					} else {
						setStatus("User exists in database!");
					}
				}
			} catch (err) {
				setError(`Unexpected error: ${err}`);
			}
		}

		testConnection();
	}, [user, isLoaded]);

	return (
		<div className="container mx-auto p-8">
			<h1 className="mb-4 font-bold text-2xl">Supabase Connection Test</h1>
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
