import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/lib/router'
import { fetchDirectory, searchClinics, stateLabel } from '@/lib/queries/directory'
import type { Clinic, DirectoryResult, Doctor } from '@/lib/queries/directory'

const LEVEL_CHIP: Record<Doctor['level'], { kind: string; label: string }> = {
  level_2: { kind: 'gold', label: 'Certified Level 2' },
  level_1: { kind: 'cert', label: 'Certified Level 1' },
  member: { kind: '', label: 'Member' },
}

const webHost = (url: string) => url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
const href = (url: string) => (/^https?:\/\//.test(url) ? url : `https://${url}`)

function ClinicCard({ c }: { c: Clinic }) {
  const place = [c.city, [c.state, c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const maps = `https://maps.google.com/?q=${encodeURIComponent([c.name, c.address, place].filter(Boolean).join(', '))}`
  return (
    <article className={`dir-card ${c.level === 'level_2' ? 'l2' : c.level === 'level_1' ? 'l1' : ''}`}>
      <h3 className="dir-banner">{c.name}</h3>
      <div className="dir-clinic">
        <p className="dir-addr">
          {c.address && <>{c.address}<br /></>}
          {place}
        </p>
        <div className="dir-links">
          {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a>}
          {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
          {c.website && <a href={href(c.website)} target="_blank" rel="noopener noreferrer">{webHost(c.website)}</a>}
          <a href={maps} target="_blank" rel="noopener noreferrer">Directions</a>
        </div>
      </div>
      <ul className="dir-docs">
        {c.doctors.map((d) => {
          const chip = LEVEL_CHIP[d.level]
          return (
            <li key={d.id}>
              <span className="dir-doc">Dr. {d.name}{d.credentials ? `, ${d.credentials}` : ''}</span>
              <span className={`cpill ${chip.kind}`}>{chip.label}</span>
            </li>
          )
        })}
      </ul>
    </article>
  )
}

export default function DirectoryPage() {
  const [data, setData] = useState<DirectoryResult | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetchDirectory().then((d) => { if (!cancelled) setData(d) })
    return () => { cancelled = true }
  }, [])

  const hits = useMemo(() => (data ? searchClinics(data.clinics, q) : []), [data, q])
  const searching = q.trim().length > 0

  // With no search, group clinics under their state or province.
  const groups = useMemo(() => {
    if (searching) return [{ label: '', clinics: hits }]
    const out: { label: string; clinics: Clinic[] }[] = []
    for (const c of hits) {
      const label = stateLabel(c.state)
      if (out[out.length - 1]?.label !== label) out.push({ label, clinics: [] })
      out[out.length - 1]!.clinics.push(c)
    }
    return out
  }, [hits, searching])

  const doctorCount = data ? data.clinics.reduce((n, c) => n + c.doctors.length, 0) : 0

  return (
    <>
      <div className="hero-img short">
        <div className="bg ph-b" />
        <div className="duo" />
        <div className="duo2" />
        <div className="scrim" />
        <div className="wrap inner">
          <div className="crumbs">
            <Link to="/">HOME</Link> <b>/</b> FIND A DOCTOR
          </div>
          <div className="kick">Doctor Directory</div>
          <h1>Find an Advanced Orthogonal Doctor</h1>
          <p className="sub">
            Clinics led by members of the Advanced Orthogonal Institute. Search by city, state, ZIP,
            clinic name or doctor.
          </p>
        </div>
      </div>

      <section className="tight">
        <div className="wrap">
          <p className="lede">
            Every doctor listed here is a member of the Institute. Certified doctors also hold the
            Institute's Level 1 or Level 2 certification in the Advanced Orthogonal procedure.
          </p>

          <div className="dir-bar">
            <input
              className="fi"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQ('')}
              placeholder="City, state, ZIP, clinic or doctor…"
              aria-label="Search the directory"
              autoComplete="off"
            />
            <div className="dir-legend" aria-label="What the labels mean">
              <span className="cpill gold">Certified Level 2</span>
              <span className="cpill cert">Certified Level 1</span>
              <span className="cpill">Member</span>
            </div>
          </div>

          {data?.sample && <p className="dir-note">Preview: these are made-up sample clinics, not real members.</p>}

          {!data && <p className="dir-note">Loading the directory…</p>}

          {data && data.clinics.length === 0 && (
            <div className="dir-empty">
              <h3>The directory is being updated</h3>
              <p>Call <a href="tel:+16562221099">(656) 222-1099</a> and we will connect you with a doctor near you.</p>
            </div>
          )}

          {data && data.clinics.length > 0 && (
            <>
              <p className="dir-count">
                {searching
                  ? `${hits.length} ${hits.length === 1 ? 'clinic matches' : 'clinics match'} "${q.trim()}"`
                  : `${data.clinics.length} clinics · ${doctorCount} doctors`}
              </p>
              {searching && hits.length === 0 && (
                <div className="dir-empty">
                  <h3>No clinics match that search</h3>
                  <p>Try a nearby city or just the state, or call <a href="tel:+16562221099">(656) 222-1099</a> and we will help you find a doctor.</p>
                </div>
              )}
              {groups.map((g) => (
                <div key={g.label || 'results'} className="dir-group">
                  {g.label && <h2 className="dir-state">{g.label}</h2>}
                  <div className="dir-grid">
                    {g.clinics.map((c) => <ClinicCard c={c} key={c.key} />)}
                  </div>
                </div>
              ))}
            </>
          )}
          <div className="dir-member">
            <b>Institute members:</b> your listing comes from your member record. Sign in and open{' '}
            <Link to="/account">My Account → Business</Link> to check that your clinic name, address,
            phone and website are up to date.
          </div>
        </div>
      </section>

      <section className="ctaband tight">
        <div className="wrap">
          <div>
            <h3>Don't see a doctor near you?</h3>
            <p>Call the Institute and we will help you find the closest Advanced Orthogonal doctor.</p>
          </div>
          <a className="b lg p-btn" href="tel:+16562221099">
            Call (656) 222-1099
          </a>
        </div>
      </section>
    </>
  )
}
