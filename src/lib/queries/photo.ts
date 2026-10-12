/* ----------------------------------------------------------------------------
 * A member's own headshot.
 *
 * The picture is squared and shrunk in the browser (512 px, JPEG) so an
 * 8 MB phone photo becomes ~40 kB, then stored in the public `headshots`
 * bucket under the member's own auth id. The address is written to the
 * member's `people.photo_url` through `set_my_photo`, a function that only
 * ever touches the signed-in member's row. Both the bucket and the function
 * are Chris's to create (issue #133); until they exist the card says so.
 * -------------------------------------------------------------------------- */
import { SB_URL, ensureSession, headers, session } from '@/lib/supabase'

const BUCKET = 'headshots'
const SIZE = 512

const missingFn = (status: number, text: string) => status === 404 || text.includes('PGRST202') || text.includes('PGRST205') || text.includes('Bucket not found')

/** Center-crop to a square and resize, returning a JPEG blob. */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2, sy = (bitmap.height - side) / 2
  const canvas = document.createElement('canvas')
  canvas.width = SIZE; canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE)
  bitmap.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.86))
}

async function setMyPhoto(url: string | null): Promise<{ ok?: true; missing?: true; error?: string }> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/set_my_photo`, { method: 'POST', headers: headers(true), body: JSON.stringify({ p_url: url }) })
  if (res.ok) return { ok: true }
  const text = await res.text()
  return missingFn(res.status, text) ? { missing: true } : { error: text }
}

/** Squares, shrinks and stores a picture under `folder/avatar.jpg`; returns its public address. */
async function putPhoto(folder: string, file: File): Promise<{ url?: string; missing?: true; error?: string }> {
  let blob: Blob
  try { blob = await squareJpeg(file) } catch { return { error: 'That file could not be read as a picture. Try a JPG or PNG.' } }
  const path = `${folder}/avatar.jpg`
  const res = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', headers: { ...headers(), 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: blob,
  })
  if (!res.ok) { const t = await res.text(); return missingFn(res.status, t) ? { missing: true } : { error: t } }
  // A version stamp so the browser shows the new picture, not the cached old one.
  return { url: `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}?v=${Date.now()}` }
}

/** The signed-in member's own photo: stored under their auth id, saved through set_my_photo. */
export async function uploadMyPhoto(file: File): Promise<{ url?: string; missing?: true; error?: string }> {
  await ensureSession()
  const uid = session.user?.id
  if (!uid) return { error: 'signed out' }
  const up = await putPhoto(uid, file)
  if (!up.url) return up
  const r = await setMyPhoto(up.url)
  return r.ok ? { url: up.url } : r
}

/** A manager adds a photo to someone else's record: stored under that person's
 * id; the caller writes the address into people.photo_url with its normal save. */
export async function uploadPhotoFor(personId: string, file: File): Promise<{ url?: string; missing?: true; error?: string }> {
  await ensureSession()
  return putPhoto(`people/${personId}`, file)
}

export async function removeMyPhoto(): Promise<{ ok?: true; missing?: true; error?: string }> {
  await ensureSession()
  const uid = session.user?.id
  if (!uid) return { error: 'signed out' }
  await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${uid}/avatar.jpg`, { method: 'DELETE', headers: headers() })
  return setMyPhoto(null)
}
