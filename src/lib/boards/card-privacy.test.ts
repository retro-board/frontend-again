import { cardActor, publicCard } from "./card-privacy";

const card = {
	id: "card",
	content: "feedback",
	is_anonymous: true,
	author_id: "author",
	anonymous_author_id: null,
	author: { name: "Secret", email: "secret@example.com" },
	anonymous_author: null,
};
it("removes every author field for other participants", () => {
	expect(publicCard(card, "other")).toEqual({
		id: "card",
		content: "feedback",
		is_anonymous: true,
		is_mine: false,
	});
});
it("lets an author recognize their card without disclosing identity", () => {
	expect(publicCard(card, "author")).toEqual({
		id: "card",
		content: "feedback",
		is_anonymous: true,
		is_mine: true,
	});
});
it("recognizes an anonymous cookie owner", () => {
	expect(
		publicCard(
			{ ...card, author_id: null, anonymous_author_id: "guest" },
			"guest",
			true,
		).is_mine,
	).toBe(true);
	expect(publicCard(card, "author", true).is_mine).toBe(false);
});
it("preserves attribution on named cards", () => {
	expect(publicCard({ ...card, is_anonymous: false }, "author")).toEqual(
		expect.objectContaining({ author: card.author }),
	);
});
it("omits actor identity on anonymous realtime events", () => {
	expect(cardActor(true, "clerk-author")).toEqual({});
	expect(cardActor(false, "clerk-author")).toEqual({ userId: "clerk-author" });
});

it.each([
	false,
	true,
])("keeps all voter identities private (anonymous viewer: %s)", (anonymous) => {
	const votes = [
		{ id: "mine", user_id: "me", anonymous_user_id: "guest" },
		{ id: "other", user_id: "someone", anonymous_user_id: "another" },
	];
	const result = publicCard(
		{ ...card, votes },
		anonymous ? "guest" : "me",
		anonymous,
	);
	expect(result.votes).toEqual([
		{ id: "mine", is_mine: true },
		{ id: "other", is_mine: false },
	]);
});
it("hides masked card text from others during creation", () => {
	expect(
		publicCard({ ...card, is_masked: true }, "other", false, "creation")
			.content,
	).toBe("");
	expect(
		publicCard({ ...card, is_masked: true }, "author", false, "creation")
			.content,
	).toBe("feedback");
	expect(
		publicCard({ ...card, is_masked: true }, "other", false, "voting").content,
	).toBe("feedback");
});
