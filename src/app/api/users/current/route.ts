import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "~/lib/db";

export async function GET() {
	const { userId } = await auth();
	if (!userId)
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const { data: user, error } = await db
		.from("users")
		.select()
		.eq("clerk_id", userId)
		.maybeSingle();
	if (error)
		return NextResponse.json({ error: "Failed to load user" }, { status: 500 });
	return NextResponse.json({ user });
}
