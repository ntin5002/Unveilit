import DashboardLayout from "@/components/DashboardLayout";
import { Cloud, HardDrive } from "lucide-react";

export default function IntegrationsPage() {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white drop-shadow-lg">Integrations</h1>
        <p className="text-white/80 mt-2 mb-8">Cloud imports are planned for a future release.</p>
        <div className="glass-card p-6 mb-6 text-slate-700">
          Provider authorization, syncing, and disconnect actions are not available in this source release.
          Saved integration metadata alone does not establish a provider connection.
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {[
            { name: "Dropbox", icon: Cloud },
            { name: "Google Drive", icon: HardDrive },
          ].map(({ name, icon: Icon }) => (
            <div key={name} className="glass-card p-6">
              <Icon className="h-8 w-8 text-blue-600 mb-4" />
              <h2 className="text-xl font-semibold text-slate-900">{name}</h2>
              <p className="text-sm text-slate-600 mt-2">Import support coming soon</p>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
