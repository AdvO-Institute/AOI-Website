import { createRoot } from 'react-dom/client'
import { BrowserRouter } from '@/lib/router'
import { AccessContext } from '@/lib/queries/AccessProvider'
import { ToastProvider } from '@/components/ui/Toast'
import MemberShell from '@/components/member/MemberShell'
import type { Access } from '@/lib/access'

const ACCESS = (window as unknown as { __ACCESS: Access }).__ACCESS
const state = {
  access: ACCESS, loading: false, ready: true, signedIn: true,
  can: (c: string) => ACCESS.capabilities.includes(c as never),
  refresh: async () => {},
}
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <ToastProvider>
      <AccessContext.Provider value={state as never}>
        <MemberShell />
      </AccessContext.Provider>
    </ToastProvider>
  </BrowserRouter>,
)
