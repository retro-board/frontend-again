export type PokerChannelMessageType =
	| "vote"
	| "join"
	| "leave"
	| "abstain"
	| "unabstain"
	| "timer_start"
	| "timer_stop"
	| "story_create"
	| "story_select"
	| "voting_start"
	| "voting_end"
	| "score_calculated";

export interface BaseChannelMessage {
	type: PokerChannelMessageType;
	sessionId: string;
	userId?: string;
	anonymousUserId?: string;
	timestamp: string;
}

export interface VoteMessage extends BaseChannelMessage {
	type: "vote";
	storyId: string;
	voteValue: string;
	userName?: string;
}

export interface JoinMessage extends BaseChannelMessage {
	type: "join";
	userName?: string;
	role: "facilitator" | "voter" | "observer";
}

export interface LeaveMessage extends BaseChannelMessage {
	type: "leave";
	userName?: string;
}

export interface AbstainMessage extends BaseChannelMessage {
	type: "abstain" | "unabstain";
	userName?: string;
}

export interface TimerMessage extends BaseChannelMessage {
	type: "timer_start" | "timer_stop";
	duration?: number; // in seconds
	endsAt?: string; // ISO timestamp
}

export interface StoryCreateMessage extends BaseChannelMessage {
	type: "story_create";
	story: {
		id: string;
		title: string;
		description?: string;
		position: number;
	};
}

export interface StorySelectMessage extends BaseChannelMessage {
	type: "story_select";
	storyId: string;
	storyTitle: string;
}

export interface VotingMessage extends BaseChannelMessage {
	type: "voting_start" | "voting_end";
	storyId: string;
}

export interface ScoreMessage extends BaseChannelMessage {
	type: "score_calculated";
	storyId: string;
	finalScore: string;
	votes: Record<string, string>; // userId/anonymousId -> vote value
}

export type PokerChannelMessage =
	| VoteMessage
	| JoinMessage
	| LeaveMessage
	| AbstainMessage
	| TimerMessage
	| StoryCreateMessage
	| StorySelectMessage
	| VotingMessage
	| ScoreMessage;

// Session state that clients maintain
export interface PokerSessionState {
	sessionId: string;
	participants: Array<{
		id: string;
		name?: string;
		isAnonymous: boolean;
		role: "facilitator" | "voter" | "observer";
		hasVoted: boolean;
		isAbstaining: boolean;
	}>;
	currentStory?: {
		id: string;
		title: string;
		description?: string;
	};
	stories: Array<{
		id: string;
		title: string;
		description?: string;
		finalEstimate?: string;
		isEstimated: boolean;
	}>;
	votingState: {
		isVoting: boolean;
		votesReceived: number;
		eligibleVoters: number;
		allVoted?: boolean;
	};
	timer: {
		isActive: boolean;
		endsAt?: string;
		duration?: number;
	};
}
