import { useEffect, useState } from 'react'
import { isAuthenticated, initiateLogin } from '../lib/auth'

interface Props {
  children: React.ReactNode
}

/**
 * Redirects unauthenticated users to the Cognito login page.
 * Renders nothing while the redirect is in progress.
 */
export default function ProtectedRoute({ children }: Props) {
  const [checked, setChecked] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    if (isAuthenticated()) {
      setAuthed(true)
      setChecked(true)
    } else {
      // Fire-and-forget: initiateLogin redirects the page
      initiateLogin().catch(console.error)
      setChecked(true)
    }
  }, [])

  if (!checked || !authed) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Redirecting to login…
      </div>
    )
  }

  return <>{children}</>
}
