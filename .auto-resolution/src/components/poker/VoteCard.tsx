"use client";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

interface VoteCardProps {
	value: string;
	selected: boolean;
	onClick: () => void;
	disabled?: boolean;
}

export function VoteCard({
	value,
	selected,
	onClick,
	disabled,
}: VoteCardProps) {
	return (
		<Button
			variant={selected ? "default" : "outline"}
			size="lg"
			className={cn(
				"h-20 font-bold text-xl transition-all",
				selected && "ring-2 ring-primary ring-offset-2",
				!disabled && "hover:scale-105",
			)}
			onClick={onClick}
			disabled={disabled}
		>
			{value}
		</Button>
	);
}
