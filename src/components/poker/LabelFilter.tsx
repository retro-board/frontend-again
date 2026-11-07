"use client";

import { ChevronDown, Tag } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

// LabelFilter: pick any number of labels; none picked means everything shows.
export function LabelFilter({
	labels,
	selected,
	onChange,
}: {
	labels: [label: string, count: number][];
	selected: string[];
	onChange: (selected: string[]) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm">
					<Tag className="size-4" />
					{selected.length ? selected.join(", ") : "All labels"}
					<ChevronDown className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
				<DropdownMenuLabel>Show tickets labelled</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{labels.map(([label, count]) => (
					<DropdownMenuCheckboxItem
						key={label}
						checked={selected.includes(label)}
						// keep the menu open so several labels can be ticked
						onSelect={(event) => event.preventDefault()}
						onCheckedChange={(checked) =>
							onChange(
								checked
									? [...selected, label]
									: selected.filter((l) => l !== label),
							)
						}
					>
						{label}
						<span className="ml-auto text-muted-foreground text-xs">
							{count}
						</span>
					</DropdownMenuCheckboxItem>
				))}
				{selected.length > 0 && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={() => onChange([])}>
							Show all labels
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
