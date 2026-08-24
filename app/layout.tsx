import '../styles/globals.css'
import Navbar from '@/components/Navbar'

export const metadata = {
  title: 'CareFlow — Healthcare Appointment & Follow-up Manager',
  description: 'Role-based healthcare appointment scheduling, pre-visit symptoms, and consultation management platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-slate-50">
      <body className="min-h-full flex flex-col font-sans text-slate-900 antialiased">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
          <p>© {new Date().getFullYear()} CareFlow Healthcare Platform. Concurrency-safe scheduling & care management.</p>
        </footer>
      </body>
    </html>
  )
}
