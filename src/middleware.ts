import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Only protect the listing pages and creation pages
// Individual board/session pages handle their own auth
const isProtectedRoute = createRouteMatcher(["/boards", "/poker"]);

export default clerkMiddleware(async (auth, req) => {
	if (isProtectedRoute(req)) {
		await auth.protect();
	}
});

export const config = {
	matcher: [
		// Skip Next.js internals and all static files, unless found in search params
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		// Always run for API routes
		"/(api|trpc)(.*)",
	],
};
