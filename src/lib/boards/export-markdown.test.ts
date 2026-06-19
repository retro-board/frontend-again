import {
	createBoardExportFilename,
	createBoardMarkdownExport,
} from "./export-markdown";

describe("createBoardMarkdownExport", () => {
	it("formats completed boards into markdown", () => {
		const markdown = createBoardMarkdownExport({
			board: {
				name: "Sprint 12 Retro",
				description: "Reviewing the sprint outcomes.",
				phase: "completed",
				created_at: "2026-06-10T09:00:00.000Z",
				updated_at: "2026-06-19T17:30:00.000Z",
				creation_time_minutes: 10,
				voting_time_minutes: 5,
				votes_per_user: 3,
			},
			columns: [
				{
					id: "col-2",
					name: "Action Items",
					position: 2,
					is_action: true,
					cards: [
						{
							id: "card-3",
							content: "Document the release checklist",
							position: 0,
							author: { name: "Alex" },
							votes: [{ id: "vote-4", user_id: "user-2" }],
						},
					],
				},
				{
					id: "col-1",
					name: "Went Well",
					position: 1,
					is_action: false,
					cards: [
						{
							id: "card-2",
							content: "Pairing helped us catch issues early",
							position: 1,
							anonymous_author: { display_name: "Anon Owl" },
							votes: [{ id: "vote-1", anonymous_user_id: "anon-1" }],
						},
						{
							id: "card-1",
							content: "The deployment was smooth\nNo rollback required",
							position: 0,
							author: { name: "Sam" },
							votes: [
								{ id: "vote-2", user_id: "user-1" },
								{ id: "vote-3", user_id: "user-2" },
							],
						},
					],
				},
			],
			exportedAt: new Date("2026-06-19T18:00:00.000Z"),
		});

		expect(markdown).toContain("# Sprint 12 Retro");
		expect(markdown).toContain("## Summary");
		expect(markdown).toContain("- Contributors: 3");
		expect(markdown).toContain("- Voters: 3");
		expect(markdown).toContain("- Total feedback votes: 3");
		expect(markdown).toContain("## Vote Totals");
		expect(markdown).toContain("- Went Well: 3 votes");
		expect(markdown).toContain("## Top Voted Cards");
		expect(markdown).toContain("1. Went Well - Sam (2 votes)");
		expect(markdown).toContain("### Went Well (2 cards, 3 votes)");
		expect(markdown).toContain("1. Sam (2 votes)");
		expect(markdown).toContain(
			"> The deployment was smooth\n> No rollback required",
		);
		expect(markdown).toContain("2. Anon Owl (1 vote)");
		expect(markdown).toContain("## Action Items");
		expect(markdown).toContain("### Action Items (1 card, 1 vote)");
		expect(markdown).toContain("1. Alex (1 vote)");
	});

	it("creates stable export filenames", () => {
		expect(
			createBoardExportFilename(
				"Team Retro / Q2",
				new Date("2026-06-19T18:00:00.000Z"),
			),
		).toBe("team-retro-q2-2026-06-19.md");
	});
});
