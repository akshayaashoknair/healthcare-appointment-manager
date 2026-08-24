'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface DoctorItem {
  id: string
  email: string
  doctorProfile?: {
    firstName: string
    lastName: string
    specialisation: string
    slotDurationMinutes: number
    isActive: boolean
  } | null
}

const SPECIALISATIONS = ['All', 'Cardiology', 'Dermatology', 'General Medicine']

export default function DoctorSearchPage() {
  const [doctors, setDoctors] = useState<DoctorItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSpec, setSelectedSpec] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    const url = selectedSpec !== 'All'
      ? `/api/doctors?specialisation=${encodeURIComponent(selectedSpec)}`
      : '/api/doctors'

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setDoctors(data.data.doctors)
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [selectedSpec])

  const filteredDoctors = doctors.filter((doc) => {
    if (!doc.doctorProfile) return false
    const fullName = `${doc.doctorProfile.firstName} ${doc.doctorProfile.lastName}`.toLowerCase()
    const spec = doc.doctorProfile.specialisation.toLowerCase()
    const query = searchQuery.toLowerCase().trim()
    return fullName.includes(query) || spec.includes(query)
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Find a Specialist</h1>
        <p className="text-sm text-slate-500 mt-1">
          Browse verified doctors and book available appointment slots
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="flex items-center space-x-2 overflow-x-auto pb-1">
          {SPECIALISATIONS.map((spec) => (
            <button
              key={spec}
              onClick={() => setSelectedSpec(spec)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                selectedSpec === spec
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {spec}
            </button>
          ))}
        </div>

        <div className="relative min-w-[280px]">
          <input
            type="text"
            placeholder="Search by name or specialty..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
        </div>
      </div>

      {/* Doctor Grid */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-slate-500 mt-3">Searching doctors...</p>
        </div>
      ) : filteredDoctors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500 text-sm">No doctors found matching your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDoctors.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg border border-blue-100">
                    Dr
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">
                      Dr. {doc.doctorProfile?.firstName} {doc.doctorProfile?.lastName}
                    </h3>
                    <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-md mt-0.5">
                      {doc.doctorProfile?.specialisation}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Consultation Duration:</span>
                    <span className="font-semibold text-slate-700">{doc.doctorProfile?.slotDurationMinutes} mins</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Availability:</span>
                    <span className="text-emerald-600 font-semibold">● Active & Accepting Slots</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <Link
                  href={`/patient/book/${doc.id}`}
                  className="w-full block text-center py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition shadow-sm"
                >
                  Book Appointment &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
