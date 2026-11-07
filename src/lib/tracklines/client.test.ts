import { TracklinesError, tracklines } from "./client";

beforeEach(() => {
	jest.clearAllMocks();
	process.env.TRACKLINES_API_URL = "https://tracklines.test/api";
});
afterEach(() => {
	delete process.env.TRACKLINES_API_URL;
});

test("loads poker board choices from the project's GET endpoint and preserves their scales", async () => {
	const boards = [
		{
			id: "board",
			project_id: "project",
			name: "Frontend",
			estimate_scale: "fibonacci",
		},
		{
			id: "unestimated",
			project_id: "project",
			name: "Site",
			estimate_scale: "none",
		},
	];
	(fetch as jest.Mock).mockImplementation(async (url: string) =>
		url.endsWith("/projects/project")
			? new Response(
					JSON.stringify({ id: "project", name: "TrackLines", boards }),
					{ status: 200 },
				)
			: new Response("Method Not Allowed", { status: 405 }),
	);
	expect(await tracklines("tl_s_test").boards("project")).toEqual(boards);
	expect(fetch).toHaveBeenCalledWith(
		"https://tracklines.test/api/projects/project",
		expect.objectContaining({
			method: "GET",
			headers: { Authorization: "Bearer tl_s_test" },
			redirect: "error",
		}),
	);
	expect(fetch).toHaveBeenCalledTimes(1);
});

test("returns an empty board list for a project with no boards", async () => {
	(fetch as jest.Mock).mockResolvedValue(
		new Response(JSON.stringify({ id: "project", boards: [] }), {
			status: 200,
		}),
	);
	expect(await tracklines("tl_s_test").boards("project")).toEqual([]);
});

test("encodes the project ID as a path segment", async () => {
	(fetch as jest.Mock).mockResolvedValue(
		new Response(JSON.stringify({ boards: [] }), { status: 200 }),
	);
	await tracklines("tl_s_test").boards("project/other");
	expect(fetch).toHaveBeenCalledWith(
		"https://tracklines.test/api/projects/project%2Fother",
		expect.any(Object),
	);
});

test("preserves TrackLin.es authorization errors so the connection can request a reconnect", async () => {
	(fetch as jest.Mock).mockResolvedValue(
		new Response("Service key revoked", { status: 403 }),
	);
	await expect(tracklines("tl_s_test").boards("project")).rejects.toEqual(
		new TracklinesError("Service key revoked", 403),
	);
});
