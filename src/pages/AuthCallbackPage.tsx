import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { handleCallback } from '../lib/auth'

/**
 * Handles the /auth/callback route after Cognito redirects back.
 * Exchanges the authorization code for tokens, then sends the user to /.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const errorParam = params.get('error')
    const errorDescription = params.get('error_description')

    if (errorParam) {
      setError(errorDescription ?? errorParam)
      return
    }

    if (!code || !state) {
      setError('Missing code or state in callback URL')
      return
    }

    handleCallback(code, state)
      .then(() => navigate('/', { replace: true }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
      })
  }, [navigate])

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-base font-medium text-slate-800">Sign-in failed</p>
        <p className="text-sm text-slate-500">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="mt-2 rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">
      Signing in…
    </div>
  )
}
