import { useEffect, useState } from 'react'
import type { PluginInfo } from '@shared/plugins'
import type { Catalogue, CatalogueItem } from '@shared/plugin-registry'
import { Icons } from '../icons'
import { Island, Empty } from '../Island'
import { usePlugins } from '@/stores/plugins'
import { useWorkbench } from '@/stores/workbench'
import { t } from '@/i18n'
import { PanelTabs } from '../PanelTabs'


/** Installed plugins (enable, approve, update, uninstall) and the catalogue (install), DESIGN.md §7.1. */
export function PluginsIsland() {
  const plugins = usePlugins((s) => s.plugins)
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromUrl, setFromUrl] = useState<string | null>(null)
  const load = async (refresh = false) => { setLoading(true); setCatalogue(await window.ct.plugins.catalogue(refresh)); setLoading(false) }
  const registry = useWorkbench((s) => s.settings?.pluginRegistry)
  // fetched once per address (cached in main), then its states follow the installed list
  useEffect(() => { load() }, [registry])
  useEffect(() => { if (catalogue && !loading) window.ct.plugins.catalogue().then(setCatalogue) }, [plugins])

  const run = async (key: string, f: () => Promise<{ ok: boolean; error?: string; cancelled?: boolean }>) => {
    setBusy(key); setError(null)
    const r = await f()
    setBusy(null)
    if (!r.ok && !r.cancelled && r.error !== 'annulé') setError(r.error ?? 'erreur')
    return r.ok
  }
  const install = (id: string) => run(id, () => window.ct.plugins.install({ id }))
  const installUrl = async () => { if (fromUrl && (await run('url', () => window.ct.plugins.install({ url: fromUrl })))) { setFromUrl(null); useWorkbench.getState().setLayout('tab:plugins', 0) } }
  const updates = catalogue?.items.filter((i) => i.state === 'update') ?? []

  const actions = (
    <>
      <button title={t('Actualiser le catalogue')} onClick={() => load(true)}>{loading ? <span className="spin" /> : Icons.refresh(14)}</button>
      <button title={t('Installer depuis une URL (.tgz)')} onClick={() => setFromUrl(fromUrl === null ? '' : null)}>{Icons.plus()}</button>
    </>
  )
  return (
    <Island title={t('Plugins')} icon={Icons.puzzle(14)} actions={actions} grow dataView="plugins">
      {fromUrl !== null && (
        <div className="form">
          <input autoFocus placeholder="https://…/plugin.tgz" value={fromUrl} onChange={(e) => setFromUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') installUrl(); if (e.key === 'Escape') setFromUrl(null) }} />
          <div className="hint">{t('Sans catalogue, l\'archive n\'est pas vérifiée : son sha256 est affiché avant l\'installation.')}</div>
          <div className="row-actions"><button className="btn primary" disabled={!fromUrl.trim() || busy === 'url'} onClick={installUrl}>{busy === 'url' ? <span className="spin" /> : t('Installer')}</button><button className="btn" onClick={() => setFromUrl(null)}>{t('Annuler')}</button></div>
        </div>
      )}
      {error && <div className="pl-error" onClick={() => setError(null)}>{error}</div>}
      <PanelTabs storeKey="plugins" tabs={[
        { id: 'installed', label: t('Installés'), content: <Installed plugins={plugins} updates={updates} busy={busy} run={run} install={install} /> },
        { id: 'catalogue', label: t('Catalogue'), count: updates.length, content: <CatalogueList catalogue={catalogue} loading={loading} busy={busy} install={install} /> },
      ]} />
    </Island>
  )
}

function Installed({ plugins, updates, busy, run, install }: { plugins: PluginInfo[]; updates: CatalogueItem[]; busy: string | null; run: (k: string, f: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>; install: (id: string) => void }) {
  if (!plugins.length) return <Empty>{t('Aucun plugin installé')}</Empty>
  const sorted = [...plugins].sort((a, b) => (a.builtin === b.builtin ? a.manifest.name.localeCompare(b.manifest.name) : a.builtin ? -1 : 1))
  return (
    <div className="list">
      {sorted.map((p) => {
        const id = p.manifest.id
        const update = updates.find((u) => u.id === id)
        const color = p.error ? 'var(--ct-badge-error)' : p.pendingPermissions ? 'var(--ct-badge-warn)' : p.enabled ? 'var(--ct-badge-info)' : 'var(--ct-text-tertiary)'
        return (
          <div key={id} className="lrow" title={p.dir} data-plugin={id} style={{ opacity: p.disabled ? 0.55 : 1 }}>
            <span className="ico" style={{ color }}>{Icons.puzzle(12)}</span>
            <div className="lbody">
              <div className="head">
                <span className="name">{p.manifest.name}</span><span className="badge dim">{p.manifest.version}</span>
                {p.builtin && <span className="badge dim">{t('intégré')}</span>}
                {p.disabled && <span className="badge dim">{t('désactivé')}</span>}
                {update && <span className="badge accent">{update.version}</span>}
              </div>
              <div className="desc" style={p.error ? { color: 'var(--ct-badge-error)' } : undefined}>
                {p.error ?? (p.pendingPermissions ? t('Permissions à approuver : {p}', { p: p.pendingPermissions.join(', ') }) : p.manifest.description ?? id)}
              </div>
            </div>
            <span className={'acts' + (p.pendingPermissions || busy === id ? ' always' : '')}>
              {busy === id ? <span className="spin" /> : <>
                {p.pendingPermissions && !p.disabled && <button className="primary" title={t('Approuver les permissions')} onClick={() => run(id, async () => ({ ok: await window.ct.plugins.approve(id), cancelled: true }))}>{Icons.check(12)}</button>}
                {update && <button className="primary" title={t('Mettre à jour vers {v}', { v: update.version })} onClick={() => install(id)}>{Icons.arrowUp(12)}</button>}
                {!p.error && <button title={p.disabled ? t('Activer') : t('Désactiver')} onClick={() => run(id, async () => { await window.ct.plugins.setEnabled(id, !!p.disabled); return { ok: true } })}>{p.disabled ? Icons.power(12) : Icons.powerOff(12)}</button>}
                {!p.builtin && <button title={t('Désinstaller')} onClick={() => run(id, () => window.ct.plugins.uninstall(id))}>{Icons.x(12)}</button>}
              </>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const STATE_LABEL: Record<CatalogueItem['state'], string> = { available: '', installed: 'installé', update: 'mise à jour', incompatible: 'incompatible', builtin: 'intégré' }

function CatalogueList({ catalogue, loading, busy, install }: { catalogue: Catalogue | null; loading: boolean; busy: string | null; install: (id: string) => void }) {
  if (!catalogue) return <Empty>{loading ? <span className="spin" /> : '—'}</Empty>
  if (catalogue.error) return <Empty><div>{t('Catalogue indisponible')}<div className="pl-src">{catalogue.error}</div><div className="pl-src">{catalogue.url}</div></div></Empty>
  if (!catalogue.items.length) return <Empty>{t('Catalogue vide')}</Empty>
  return (
    <div className="list">
      {catalogue.items.map((i) => (
        <div key={i.id} className="lrow" title={i.repo ?? i.url} data-plugin={i.id} style={{ opacity: i.state === 'incompatible' ? 0.55 : 1 }}>
          <span className="ico" style={{ color: 'var(--ct-badge-info)' }}>{Icons.puzzle(12)}</span>
          <div className="lbody">
            <div className="head">
              <span className="name">{i.name}</span><span className="badge dim">{i.version}</span>
              {STATE_LABEL[i.state] && <span className={'badge ' + (i.state === 'update' ? 'accent' : 'dim')}>{t(STATE_LABEL[i.state])}</span>}
            </div>
            <div className="desc">{i.description ?? i.id}</div>
            {i.permissions.length > 0 && <div className="desc">{t('Permissions : {p}', { p: i.permissions.join(', ') })}</div>}
          </div>
          {(i.state === 'available' || i.state === 'update') && (
            <span className="acts always">
              {busy === i.id ? <span className="spin" /> : <button className="primary" title={i.state === 'update' ? t('Mettre à jour') : t('Installer')} onClick={() => install(i.id)}>{i.state === 'update' ? Icons.arrowUp(12) : Icons.download(12)}</button>}
            </span>
          )}
        </div>
      ))}
      {catalogue.skipped.length > 0 && <div className="pl-src" title={catalogue.skipped.join('\n')}>{t('{n} entrée(s) ignorée(s)', { n: catalogue.skipped.length })}</div>}
    </div>
  )
}
