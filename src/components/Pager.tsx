"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";

// usePaged: one page of a long list, plus the Pager to move between pages.
export function usePaged<T>(items: T[], size = 10) {
	const [page, setPage] = useState(0);
	const pages = Math.max(1, Math.ceil(items.length / size));
	const current = Math.min(page, pages - 1); // the list can shrink under us
	return {
		items: items.slice(current * size, (current + 1) * size),
		pager: <Pager page={current} pages={pages} onPage={setPage} />,
	};
}

function Pager({
	page,
	pages,
	onPage,
}: {
	page: number;
	pages: number;
	onPage: (page: number) => void;
}) {
	if (pages < 2) return null;
	return (
		<nav
			aria-label="Pagination"
			className="flex items-center justify-between gap-2 pt-2"
		>
			<Button
				variant="outline"
				size="sm"
				disabled={page === 0}
				onClick={() => onPage(page - 1)}
			>
				<ChevronLeft className="size-4" />
				Previous
			</Button>
			<span className="text-muted-foreground text-sm">
				Page {page + 1} of {pages}
			</span>
			<Button
				variant="outline"
				size="sm"
				disabled={page === pages - 1}
				onClick={() => onPage(page + 1)}
			>
				Next
				<ChevronRight className="size-4" />
			</Button>
		</nav>
	);
}
