import { setupDatabaseMocks } from "~/test/helpers";
import { sessionHasStory, validPokerVote } from "./story-scope";

jest.mock("~/lib/db");
it("looks up a story by both story and session ids", async () => {
	const mocks = setupDatabaseMocks();
	expect(await sessionHasStory("mine", "foreign")).toBe(false);
	expect(mocks.eqMock).toHaveBeenCalledWith("id", "foreign");
	expect(mocks.eqMock).toHaveBeenCalledWith("session_id", "mine");
	mocks.maybeSingleMock.mockResolvedValue({ data: { id: "own" }, error: null });
	expect(await sessionHasStory("mine", "own")).toBe(true);
});
it("refuses off-scale votes and supports custom scales", () => {
	expect(validPokerVote("999", "fibonacci")).toBe(false);
	expect(validPokerVote("3", "fibonacci")).toBe(true);
	expect(validPokerVote("3", "fibonacci", ["1", "2"])).toBe(false);
	expect(validPokerVote("?", "fibonacci")).toBe(true);
	expect(validPokerVote("abstain", "fibonacci")).toBe(true);
});
