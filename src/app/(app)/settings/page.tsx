import { requireUser } from "@/lib/session-helpers";
import { BackButton } from "@/components/back-button";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <BackButton fallback="/" label="Home" />
      <h1 className="font-display mt-4 text-3xl font-bold uppercase tracking-wide">Settings</h1>

      <SettingsClient
        displayNameMode={user.displayNameMode}
        realName={user.realName}
        activatePlayerName={user.activatePlayerName}
      />
    </div>
  );
}
