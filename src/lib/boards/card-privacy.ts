type AuthoredCard = {
	is_anonymous?: boolean;
	is_masked?: boolean;
	content?: string;
	author_id?: string | null;
	anonymous_author_id?: string | null;
	votes?: { id: string; user_id?: string; anonymous_user_id?: string }[];
	author?: unknown;
	anonymous_author?: unknown;
};

export function publicCard<T extends AuthoredCard>(
	card: T,
	viewerId?: string,
	anonymous = false,
	phase?: string,
) {
	const is_mine =
		!!viewerId &&
		(anonymous ? card.anonymous_author_id : card.author_id) === viewerId;
	const votes = card.votes?.map((vote) => ({
		id: vote.id,
		is_mine:
			!!viewerId &&
			(anonymous ? vote.anonymous_user_id : vote.user_id) === viewerId,
	}));
	const sanitized = {
		...card,
		...(phase === "creation" && card.is_masked && !is_mine
			? { content: "" }
			: {}),
		...(votes ? { votes } : {}),
		is_mine,
	};
	if (!card.is_anonymous) return sanitized;
	const {
		author: _author,
		anonymous_author: _anonymousAuthor,
		author_id: _authorId,
		anonymous_author_id: _anonymousAuthorId,
		...safe
	} = sanitized;
	return { ...safe, is_mine };
}

export function cardActor(isAnonymous: boolean, userId: string | null) {
	return isAnonymous || !userId ? {} : { userId };
}
