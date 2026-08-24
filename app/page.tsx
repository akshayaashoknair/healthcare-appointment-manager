import Link from 'next/link'

export default function Home() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-12 md:py-16 bg-gradient-to-b from-blue-50/70 via-indigo-50/30 to-transparent rounded-3xl px-6 border border-blue-100/50">
        <div className="inline-flex items-center space-x-2 px-3 py-1 bg-blue-100/80 text-blue-700 text-xs font-bold rounded-full mb-6">
          <span>✨ CareFlow Healthcare SaaS Platform</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight max-w-3xl mx-auto leading-tight">
          Modern Healthcare Scheduling, Clinical AI & Follow-up Platform
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
          Concurrency-protected booking, pre-visit AI clinical triage, post-visit care plans, durable notification outbox, and real-time Google Calendar synchronization.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/patient/doctors"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition text-sm"
          >
            Find a Doctor & Book Slot
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl border border-slate-200 shadow-xs transition text-sm"
          >
            Sign In to Portals
          </Link>
        </div>
      </section>

      {/* Role Portals Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-2xl font-bold border border-blue-100">
              🩺
            </div>
            <h3 className="text-xl font-bold text-slate-900">Patient Portal</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Search specialists, view live available slots in clinic timezone, describe symptoms with 5-minute holds, sync with Google Calendar, and view doctor prescriptions with patient-friendly AI care summaries.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link
              href="/patient"
              className="text-xs font-bold text-blue-600 hover:text-blue-800 transition flex items-center gap-1"
            >
              Patient Dashboard &rarr;
            </Link>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-2xl font-bold border border-indigo-100">
              👨‍⚕️
            </div>
            <h3 className="text-xl font-bold text-slate-900">Doctor Portal</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Manage daily schedules, review pre-visit symptoms with AI urgency triage (Low/Med/High) and suggested questions, record clinical findings, and generate structured medication prescriptions.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link
              href="/doctor"
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1"
            >
              Doctor Workspace &rarr;
            </Link>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-2xl font-bold border border-purple-100">
              ⚙️
            </div>
            <h3 className="text-xl font-bold text-slate-900">Admin Console</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Onboard physicians, configure customized slot durations, edit weekly working hour intervals, and schedule doctor leaves with automatic conflict resolution and patient outbox notifications.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link
              href="/admin"
              className="text-xs font-bold text-purple-600 hover:text-purple-800 transition flex items-center gap-1"
            >
              Admin Console &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Feature & Architecture Highlights */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Clinical Architecture & Safety Guarantees</h2>
          <p className="text-xs text-slate-500 mt-0.5">Enterprise reliability designed for real healthcare workflows</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="border-l-2 border-blue-500 pl-4 space-y-1">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">PostgreSQL GiST Exclusion</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Active slot occupancy enforced by PostgreSQL exclusion constraint on <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded font-mono">[start, end)</code> intervals. Collisions return HTTP 409.
            </p>
          </div>
          <div className="border-l-2 border-emerald-500 pl-4 space-y-1">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Clinical AI Triage</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Pre-visit AI evaluates urgency and suggests clinical questions. Post-visit AI translates notes into clear patient guidance. LLM failures never fail appointments.
            </p>
          </div>
          <div className="border-l-2 border-amber-500 pl-4 space-y-1">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Durable Outbox & Retries</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Notifications, appointment reminders, and medication schedules stored in PostgreSQL outbox jobs with bounded exponential backoff and idempotency keys.
            </p>
          </div>
          <div className="border-l-2 border-indigo-500 pl-4 space-y-1">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Google Calendar Sync</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Secure OAuth 2.0 with AES-256-GCM encrypted tokens at rest. Asynchronously synchronizes booking confirmations, reschedules, and cancellations.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
