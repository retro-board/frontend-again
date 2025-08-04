"use client";

import { Check, Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { PokerVote, Story, User } from "~/types/database";

interface ParticipantListProps {
	participants: {
		user: User;
		role: string;
	}[];
	currentStory?: Story & {
		votes: (PokerVote & { user: User })[];
	};
	showVotes: boolean;
}

export function ParticipantList({
	participants,
	currentStory,
	showVotes,
}: ParticipantListProps) {
	const getInitials = (name?: string, email?: string) => {
		if (name) {
			return name
				.split(" ")
				.map((n) => n[0])
				.join("")
				.toUpperCase();
		}
		return email?.[0]?.toUpperCase() || "?";
	};

	const getUserVote = (userId: string) => {
		return currentStory?.votes.find((v) => v.user_id === userId);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					Participants
					<Badge variant="secondary">{participants.length}</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-3">
					{participants.map(({ user, role }) => {
						const vote = getUserVote(user.id);
						const hasVoted = !!vote;

						return (
							<div key={user.id} className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<Avatar className="h-8 w-8">
										<AvatarImage src={user.avatar_url || undefined} />
										<AvatarFallback>
											{getInitials(user.name, user.email)}
										</AvatarFallback>
									</Avatar>
									<div>
										<p className="font-medium text-sm">
											{user.name || user.email}
										</p>
										{role === "facilitator" && (
											<Badge variant="outline" className="text-xs">
												Facilitator
											</Badge>
										)}
									</div>
								</div>
								<div>
									{currentStory && (
										<>
											{showVotes && vote ? (
												<Badge>{vote.vote_value}</Badge>
											) : hasVoted ? (
												<Check className="h-4 w-4 text-green-500" />
											) : (
												<Clock className="h-4 w-4 text-muted-foreground" />
											)}
										</>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
