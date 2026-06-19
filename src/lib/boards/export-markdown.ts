import type { Board } from "~/types/database";

type ExportAuthor = {
	name?: string | null;
	email?: string | null;
};

type ExportAnonymousAuthor = {
	display_name?: string | null;
};

type ExportVote = {
	id: string;
	user_id?: string | null;
	anonymous_user_id?: string | null;
};

export type ExportCard = {
	id: string;
	content: string;
	position: number;
	is_anonymous?: boolean;
	author?: ExportAuthor | null;
	anonymous_author?: ExportAnonymousAuthor | null;
	votes?: ExportVote[];
};

export type ExportColumn = {
	id: string;
	name: string;
	position: number;
	is_action: boolean;
	cards: ExportCard[];
};

export type BoardExportData = {
	board: Pick<
		Board,
		| "name"
		| "description"
		| "phase"
		| "creation_time_minutes"
		| "voting_time_minutes"
		| "votes_per_user"
	> & {
		created_at: Date | string;
		updated_at: Date | string;
	};
	columns: ExportColumn[];
	exportedAt?: Date;
};

function formatDate(value: Date | string | undefined) {
	if (!value) {
		return "Unknown";
	}

	return new Date(value).toISOString();
}

function sortColumns(columns: ExportColumn[]) {
	return [...columns].sort((a, b) => a.position - b.position);
}

function sortCards(cards: ExportCard[]) {
	return [...cards].sort((a, b) => a.position - b.position);
}

function getVoteCount(card: ExportCard) {
	return card.votes?.length ?? 0;
}

function getColumnVoteCount(column: ExportColumn) {
	return column.cards.reduce((total, card) => total + getVoteCount(card), 0);
}

function getAuthorName(card: ExportCard) {
	if (card.anonymous_author?.display_name) {
		return card.anonymous_author.display_name;
	}

	if (card.author?.name) {
		return card.author.name;
	}

	if (card.author?.email) {
		return card.author.email;
	}

	if (card.is_anonymous) {
		return "Anonymous participant";
	}

	return "Unknown author";
}

function getAuthorKey(card: ExportCard) {
	if (card.anonymous_author?.display_name) {
		return `anonymous:${card.anonymous_author.display_name}`;
	}

	if (card.author?.email) {
		return `user:${card.author.email}`;
	}

	if (card.author?.name) {
		return `user:${card.author.name}`;
	}

	if (card.is_anonymous) {
		return "anonymous:unknown";
	}

	return `unknown:${card.id}`;
}

function getUniqueContributorCount(cards: ExportCard[]) {
	return new Set(cards.map(getAuthorKey)).size;
}

function getUniqueVoterCount(cards: ExportCard[]) {
	return new Set(
		cards.flatMap((card) =>
			(card.votes ?? []).map((vote) => {
				if (vote.user_id) {
					return `user:${vote.user_id}`;
				}

				if (vote.anonymous_user_id) {
					return `anonymous:${vote.anonymous_user_id}`;
				}

				return `vote:${vote.id}`;
			}),
		),
	).size;
}

function formatQuotedContent(content: string) {
	return content
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n");
}

function formatCard(card: ExportCard, index: number) {
	const voteCount = getVoteCount(card);
	const voteLabel = voteCount === 1 ? "vote" : "votes";

	return [
		`${index}. ${getAuthorName(card)}${voteCount > 0 ? ` (${voteCount} ${voteLabel})` : ""}`,
		"",
		formatQuotedContent(card.content),
	].join("\n");
}

function formatColumn(column: ExportColumn) {
	const cards = sortCards(column.cards);
	const voteCount = getColumnVoteCount(column);
	const voteLabel = voteCount === 1 ? "vote" : "votes";
	const cardLabel = cards.length === 1 ? "card" : "cards";
	const heading = `### ${column.name} (${cards.length} ${cardLabel}, ${voteCount} ${voteLabel})`;

	if (cards.length === 0) {
		return [heading, "", "_No cards_"].join("\n");
	}

	return [
		heading,
		"",
		...cards.flatMap((card, index) => [formatCard(card, index + 1), ""]),
	]
		.join("\n")
		.trimEnd();
}

export function createBoardExportFilename(
	boardName: string,
	exportedAt = new Date(),
) {
	const safeName =
		boardName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "retro-board";
	const date = exportedAt.toISOString().slice(0, 10);

	return `${safeName}-${date}.md`;
}

export function createBoardMarkdownExport({
	board,
	columns,
	exportedAt = new Date(),
}: BoardExportData) {
	const sortedColumns = sortColumns(columns);
	const regularColumns = sortedColumns.filter((column) => !column.is_action);
	const actionColumns = sortedColumns.filter((column) => column.is_action);
	const allCards = sortedColumns.flatMap((column) =>
		sortCards(column.cards).map((card) => ({
			...card,
			columnName: column.name,
			isAction: column.is_action,
		})),
	);
	const topVotedCards = allCards
		.filter((card) => !card.isAction && getVoteCount(card) > 0)
		.sort(
			(a, b) => getVoteCount(b) - getVoteCount(a) || a.position - b.position,
		);
	const feedbackCards = allCards.filter((card) => !card.isAction);
	const actionItemCount = actionColumns.reduce(
		(total, column) => total + column.cards.length,
		0,
	);
	const feedbackVoteCount = regularColumns.reduce(
		(total, column) => total + getColumnVoteCount(column),
		0,
	);
	const actionVoteCount = actionColumns.reduce(
		(total, column) => total + getColumnVoteCount(column),
		0,
	);

	const lines = [
		`# ${board.name}`,
		"",
		...(board.description ? [board.description, ""] : []),
		"## Summary",
		"",
		`- Exported at: ${formatDate(exportedAt)}`,
		`- Board completed at: ${formatDate(board.updated_at)}`,
		`- Board created at: ${formatDate(board.created_at)}`,
		`- Votes per participant: ${board.votes_per_user}`,
		`- Creation timer: ${board.creation_time_minutes} minute${board.creation_time_minutes === 1 ? "" : "s"}`,
		`- Voting timer: ${board.voting_time_minutes} minute${board.voting_time_minutes === 1 ? "" : "s"}`,
		`- Contributors: ${getUniqueContributorCount(allCards)}`,
		`- Voters: ${getUniqueVoterCount(feedbackCards)}`,
		`- Feedback columns: ${regularColumns.length}`,
		`- Total feedback cards: ${regularColumns.reduce((total, column) => total + column.cards.length, 0)}`,
		`- Total feedback votes: ${feedbackVoteCount}`,
		`- Action items: ${actionItemCount}`,
		`- Action item votes: ${actionVoteCount}`,
	];

	if (regularColumns.length > 0) {
		lines.push(
			"",
			"## Vote Totals",
			"",
			...regularColumns.map((column) => {
				const voteCount = getColumnVoteCount(column);
				const voteLabel = voteCount === 1 ? "vote" : "votes";
				return `- ${column.name}: ${voteCount} ${voteLabel}`;
			}),
		);
	}

	if (topVotedCards.length > 0) {
		lines.push(
			"",
			"## Top Voted Cards",
			"",
			...topVotedCards.flatMap((card, index) => [
				`${index + 1}. ${card.columnName} - ${getAuthorName(card)} (${getVoteCount(card)} votes)`,
				"",
				formatQuotedContent(card.content),
				"",
			]),
		);
	}

	lines.push("", "## Feedback", "");

	if (regularColumns.length === 0) {
		lines.push("_No feedback columns_");
	} else {
		for (const column of regularColumns) {
			lines.push(formatColumn(column), "");
		}
	}

	lines.push("## Action Items", "");

	if (actionColumns.length === 0) {
		lines.push("_No action item columns_");
	} else {
		for (const column of actionColumns) {
			lines.push(formatColumn(column), "");
		}
	}

	return `${lines.join("\n").trimEnd()}\n`;
}
