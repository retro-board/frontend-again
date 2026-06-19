"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";

interface BoardExportButtonProps {
	boardId: string;
	boardName: string;
}

function getFilenameFromDisposition(
	contentDisposition: string | null,
	boardName: string,
) {
	const match = contentDisposition?.match(/filename="([^"]+)"/);
	return match?.[1] ?? `${boardName}.md`;
}

export function BoardExportButton({
	boardId,
	boardName,
}: BoardExportButtonProps) {
	const [isExporting, setIsExporting] = useState(false);

	const handleExport = async () => {
		setIsExporting(true);

		try {
			const response = await fetch(`/api/boards/${boardId}/export`);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to export board");
			}

			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = getFilenameFromDisposition(
				response.headers.get("content-disposition"),
				boardName,
			);
			document.body.append(anchor);
			anchor.click();
			anchor.remove();
			window.URL.revokeObjectURL(url);
			toast.success("Markdown export downloaded");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to export board",
			);
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<Button variant="outline" onClick={handleExport} disabled={isExporting}>
			<Download className="mr-2 h-4 w-4" />
			{isExporting ? "Exporting..." : "Export Markdown"}
		</Button>
	);
}
