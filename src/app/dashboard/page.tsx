export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Welcome to the Emote Technology automation platform.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Connection Status Card */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-lg">
              💬
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                WhatsApp
              </p>
              <p className="text-sm font-semibold text-slate-200">Not Connected</p>
            </div>
          </div>
        </div>

        {/* Webhook Status Card */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-lg">
              🔔
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Webhooks
              </p>
              <p className="text-sm font-semibold text-slate-200">Waiting</p>
            </div>
          </div>
        </div>

        {/* Automation Status Card */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-lg">
              ⚡
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Automation
              </p>
              <p className="text-sm font-semibold text-slate-200">Inactive</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Setup Card */}
      <div className="rounded-2xl border border-emerald-500/10 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 p-8">
        <h2 className="text-lg font-semibold text-white">Get Started</h2>
        <p className="mt-2 text-sm text-slate-400">
          Connect your WhatsApp Business account to start automating conversations.
        </p>
        <a
          href="/dashboard/whatsapp"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-emerald-500/30"
        >
          Connect WhatsApp
          <span>→</span>
        </a>
      </div>
    </div>
  );
}
