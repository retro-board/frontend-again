import { notFound } from "next/navigation";
import { TracklinesSettings } from "~/components/settings/TracklinesSettings";
import { flagEnabled } from "~/lib/flags";

export const dynamic = "force-dynamic"; // the flag is read on each visit

// /settings is behind the flags.gg "settings" flag (RB-8)
export default async function SettingsPage() {
	if (!(await flagEnabled("settings"))) notFound();
	return <TracklinesSettings />;
}
