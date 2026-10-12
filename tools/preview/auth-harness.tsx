/** Design harness for the header account menu and the sign-in card. Not shipped. */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from '@/lib/router'
import { AccessContext } from '@/lib/queries/AccessProvider'
import { ToastProvider } from '@/components/ui/Toast'
import AccountMenu from '@/components/layout/AccountMenu'
import type { Access } from '@/lib/access'

const A = (window as unknown as { __ACCESS: Access }).__ACCESS
const OUT: Access = { ...A, person: null, roles: [], committees: [], capabilities: [] }

function Case({ label, access, signedIn }: { label: string; access: Access; signedIn: boolean }) {
  const state = {
    access, loading: false, ready: true, signedIn,
    can: (c: string) => access.capabilities.includes(c as never),
    refresh: async () => {},
  }
  return (
    <AccessContext.Provider value={state as never}>
      <div className="case">
        <span className="caselabel">{label}</span>
        <div className="lr-r"><AccountMenu /></div>
      </div>
    </AccessContext.Provider>
  )
}

function Board() {
  const [withPhoto] = useState(true)
  return (
    <BrowserRouter>
      <ToastProvider>
        <Case label="Signed out" access={OUT} signedIn={false} />
        <Case label="Signed in — initials" access={{ ...A, person: { ...A.person!, photo_url: undefined } }} signedIn />
        <Case label="Signed in — headshot" access={withPhoto ? A : OUT} signedIn />
      </ToastProvider>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')!).render(<Board />)
