export type EstimationType = "fibonacci" | "tshirt" | "oneToTen";
export type BoardRole = "owner" | "participant" | "observer";
export type PokerRole = "facilitator" | "voter" | "observer";
export type BoardPhase =
	| "setup"
	| "creation"
	| "voting"
	| "discussion"
	| "completed";
export type TimerDuration = 30 | 60 | 180; // seconds

export interface User {
	id: string;
	clerk_id: string;
	email: string;
	name?: string;
	avatar_url?: string;
	created_at: Date;
	updated_at: Date;
}

export interface Board {
	id: string;
	name: string;
	description?: string;
	owner_id: string;
	is_active: boolean;
	share_id: string;
	creation_time_minutes: number;
	voting_time_minutes: number;
	votes_per_user: number;
	phase: BoardPhase;
	phase_started_at?: Date;
	phase_ends_at?: Date;
	created_at: Date;
	updated_at: Date;
}

export interface Column {
	id: string;
	board_id: string;
	name: string;
	color: string;
	position: number;
	is_action: boolean;
	created_at: Date;
}

export interface Card {
	id: string;
	column_id: string;
	content: string;
	author_id?: string;
	anonymous_author_id?: string;
	position: number;
	is_anonymous: boolean;
	is_masked: boolean;
	created_at: Date;
	updated_at: Date;
}

export interface CardVote {
	id: string;
	card_id: string;
	user_id?: string;
	anonymous_user_id?: string;
	created_at: Date;
}

export interface BoardParticipant {
	id: string;
	board_id: string;
	user_id: string;
	role: BoardRole;
	joined_at: Date;
}

export interface PokerSession {
	id: string;
	name: string;
	description?: string;
	owner_id: string;
	estimation_type: EstimationType;
	current_story_id?: string;
	is_active: boolean;
	reveal_votes: boolean;
	share_id: string;
	timer_seconds: number;
	timer_started_at?: Date;
	timer_ends_at?: Date;
	created_at: Date;
	updated_at: Date;
}

export interface Story {
	id: string;
	session_id: string;
	title: string;
	description?: string;
	final_estimate?: string;
	position: number;
	is_estimated: boolean;
	created_at: Date;
	updated_at: Date;
}

export interface PokerVote {
	id: string;
	story_id: string;
	user_id?: string;
	anonymous_user_id?: string;
	vote_value: string;
	created_at: Date;
}

export interface PokerParticipant {
	id: string;
	session_id: string;
	user_id: string;
	role: PokerRole;
	joined_at: Date;
}

// Estimation values for different types
export const ESTIMATION_VALUES = {
	fibonacci: ["0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "?"],
	tshirt: ["XS", "S", "M", "L", "XL", "XXL", "?"],
	oneToTen: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "?"],
} as const;

// New interfaces for anonymous users
export interface AnonymousUser {
	id: string;
	session_id: string;
	display_name: string;
	created_at: Date;
}

export interface BoardAnonymousParticipant {
	id: string;
	board_id: string;
	anonymous_user_id: string;
	joined_at: Date;
}

export interface LinkedCards {
	id: string;
	board_id: string;
	primary_card_id: string;
	linked_card_id: string;
	created_at: Date;
}

// Extended types with relations
export interface BoardWithColumns extends Board {
	columns: Column[];
}

export interface ColumnWithCards extends Column {
	cards: (Card & { votes: CardVote[] })[];
}

export interface BoardWithParticipants extends Board {
	participants: (BoardParticipant & { user: User })[];
}

export interface PokerSessionWithStories extends PokerSession {
	stories: Story[];
	participants: (PokerParticipant & { user: User })[];
}

export interface StoryWithVotes extends Story {
	votes: (PokerVote & { user: User })[];
}
