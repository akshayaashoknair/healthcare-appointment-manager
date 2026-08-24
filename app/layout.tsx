import '../styles/globals.css'

export const metadata = {
  title: 'CareFlow',
  description: 'Healthcare Appointment & Follow-up Manager'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
