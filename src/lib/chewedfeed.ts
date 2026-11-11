import { reportError } from "~/lib/bugfixes";
import { getPool } from "~/lib/db";

// ChewedFeed HQ's standard product hook: POST /api/product-customers/sync with X-Enquiry-Key.
// Retro Board has no paid plans, so every signed-in user is a free customer.
// Off without CHEWEDFEED_API_URL and CHEWEDFEED_ENQUIRY_KEY.

export type Customer = { clerkId: string; email: string; name?: string | null };

/** Send one user to ChewedFeed. Best effort: failures are reported, never thrown. */
export async function syncCustomer(customer: Customer): Promise<void> {
	const url = process.env.CHEWEDFEED_API_URL?.replace(/\/$/, "");
	const key = process.env.CHEWEDFEED_ENQUIRY_KEY;
	// routes store "" when Clerk has no address; ChewedFeed needs one
	if (!url || !key || !customer.email?.includes("@")) return;
	try {
		const response = await fetch(`${url}/api/product-customers/sync`, {
			method: "POST",
			headers: { "content-type": "application/json", "x-enquiry-key": key },
			body: JSON.stringify({
				external_customer_id: customer.clerkId,
				email: customer.email,
				name: customer.name ?? "",
				plan: "free",
			}),
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok)
			reportError("ChewedFeed customer sync failed", String(response.status));
	} catch (error) {
		reportError("ChewedFeed customer sync failed", error);
	}
}

/** Send every user: a backfill, and a catch-up for the routes that create users themselves. */
// ponytail: one POST per user, one at a time; a batch endpoint in ChewedFeed if users reach the thousands
export async function syncAllCustomers(): Promise<void> {
	try {
		const { rows } = await getPool().query<Customer>(
			`SELECT clerk_id AS "clerkId", email, name FROM users`,
		);
		for (const user of rows) await syncCustomer(user);
	} catch (error) {
		reportError("ChewedFeed customer sweep failed", error);
	}
}
