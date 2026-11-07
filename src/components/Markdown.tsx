import ReactMarkdown from "react-markdown";
import { cn } from "~/lib/utils";

// Markdown with readable defaults: Tailwind's base styles strip list bullets, heading sizes and
// spacing, so they're put back here. react-markdown never renders raw HTML.
const styles = [
	"space-y-2 break-words",
	"[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
	"[&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm",
	"[&_a]:underline [&_strong]:font-semibold [&_em]:italic",
	"[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
	"[&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
	"[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
].join(" ");

export function Markdown({
	children,
	className,
}: {
	children: string;
	className?: string;
}) {
	return (
		<div className={cn(styles, className)}>
			<ReactMarkdown
				components={{
					a: ({ node: _node, ...props }) => (
						<a {...props} target="_blank" rel="noreferrer" />
					),
				}}
			>
				{children}
			</ReactMarkdown>
		</div>
	);
}
