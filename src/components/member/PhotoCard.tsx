/* ----------------------------------------------------------------------------
 * Your photo — the member's headshot, on the Overview. Shows the picture (or
 * initials), with Add / Change / Remove. The upload itself lives in
 * lib/queries/photo.ts. Where a member's photo appears: Contacts, the Board
 * tab, speaker lists on events and, once #69 lands, Find a Doctor.
 * -------------------------------------------------------------------------- */
import { useRef, useState } from 'react'
import { Link } from '@/lib/router'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useToast } from '@/components/ui/Toast'
import { uploadMyPhoto, removeMyPhoto } from '@/lib/queries/photo'

const initials = (first?: string, last?: string) => `${(first ?? '')[0] ?? ''}${(last ?? '')[0] ?? ''}`.toUpperCase() || '·'

export default function PhotoCard() {
  const { access, refresh } = useAccess()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)
  const p = access.person
  if (!p) return null
  const photo = p.photo_url

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('Please choose a picture (JPG, PNG or HEIC).')
    setBusy(true)
    const r = await uploadMyPhoto(file)
    setBusy(false)
    if (input.current) input.current.value = ''
    if (r.missing) return setMissing(true)
    if (r.error) return toast('Your photo could not be saved just now. Please try again.')
    await refresh()
    toast('Your photo is saved.')
  }
  const remove = async () => {
    setBusy(true)
    const r = await removeMyPhoto()
    setBusy(false)
    if (r.missing) return setMissing(true)
    if (r.error) return toast('Your photo could not be removed just now. Please try again.')
    await refresh()
    toast('Photo removed.')
  }

  return (
    <div className="ov-photo">
      <div className="av">{photo ? <img src={photo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} /> : initials(p.first_name, p.last_name)}</div>
      <div className="tx">
        <b>Your photo</b>
        {missing
          ? <p>Photo uploads are being switched on. Until then, <Link to="/contact">send us a headshot</Link> and we will add it for you.</p>
          : <p>{photo ? 'Shown beside your name in Contacts, on the Board page and in Find a Doctor.' : 'Add a headshot so other members recognize you. It appears beside your name in Contacts and in Find a Doctor.'}</p>}
      </div>
      {!missing && (
        <div className="ac">
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          <button type="button" className="b p-btn xs" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Saving…' : photo ? 'Change' : 'Add a photo'}</button>
          {photo && <button type="button" className="b s-btn on-light xs" disabled={busy} onClick={() => void remove()}>Remove</button>}
        </div>
      )}
    </div>
  )
}
