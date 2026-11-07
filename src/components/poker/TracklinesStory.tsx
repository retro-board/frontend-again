"use client";

import { useFlags } from "@flags-gg/react-library";
import { Markdown } from "~/components/Markdown";
import type { Story } from "~/types/database";

function safeURL(url: string) {
	try {
		const parsed = new URL(url);
		return ["https:", "http:"].includes(parsed.protocol);
	} catch {
		return false;
	}
}
export function TracklinesStory({ story }: { story: Story }) {
	const enabled = useFlags().is("rb-6").enabled();
	if (!enabled || !story.tracklines_key) return null;
	return (
		<section className="space-y-3" aria-label="TrackLin.es story">
			{story.tracklines_url && safeURL(story.tracklines_url) && (
				<a
					className="underline"
					href={story.tracklines_url}
					target="_blank"
					rel="noreferrer"
				>
					{story.tracklines_key}
				</a>
			)}
			<Markdown className="text-sm">{story.description ?? ""}</Markdown>
			<ul className="space-y-2">
				{story.tracklines_attachments
					?.filter((file) => safeURL(file.url))
					.map((file) => (
						<li key={file.id}>
							{file.content_type.startsWith("image/") ? (
								<a href={file.url} target="_blank" rel="noreferrer">
									{/* biome-ignore lint/performance/noImgElement: External attachment hosts vary; render without proxying signed URLs. */}
									<img
										src={file.url}
										alt={file.name}
										className="max-h-64 max-w-full rounded"
										loading="lazy"
									/>
								</a>
							) : (
								<a
									href={file.url}
									className="underline"
									target="_blank"
									rel="noreferrer"
								>
									{file.name}
								</a>
							)}
						</li>
					))}
			</ul>
		</section>
	);
}
