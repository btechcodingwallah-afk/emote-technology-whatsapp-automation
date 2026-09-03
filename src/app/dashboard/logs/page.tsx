export default function LogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Activity Logs</h1>
        <p className="mt-1 text-sm text-slate-400">
          View webhook events, messages, and system activity.
        </p>
      </div>
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center">
        <p className="text-4xl mb-4">📋</p>
        <p className="text-sm text-slate-400">
          Logs will appear here once your WhatsApp connection is active.
        </p>
      </div>
    </div>
  );
}
