type AuthoredCard = {
	is_anonymous?: boolean;
	author_id?: string | null;
	anonymous_author_id?: string | null;
	author?: unknown;
	anonymous_author?: unknown;
};

export function publicCard<T extends AuthoredCard>(
	card: T,
	viewerId?: string,
	anonymous = false,
) {
	const is_mine =
		!!viewerId &&
		(anonymous ? card.anonymous_author_id : card.author_id) === viewerId;
	if (!card.is_anonymous) return { ...card, is_mine };
	const {
		author: _author,
		anonymous_author: _anonymousAuthor,
		author_id: _authorId,
		anonymous_author_id: _anonymousAuthorId,
		...safe
	} = card;
	return { ...safe, is_mine };
}

export function cardActor(isAnonymous: boolean, userId: string | null) {
	return isAnonymous || !userId ? {} : { userId };
}
