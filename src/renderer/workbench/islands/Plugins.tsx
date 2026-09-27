import { Icons } from '../icons'
import { Island, Empty } from '../Island'
import { usePlugins } from '@/stores/plugins'
import { t } from '@/i18n'

/** Installed plugins (built-in and user), with their state. */
export function PluginsIsland() {
  const plugins = usePlugins((s) => s.plugins)
  return (
    <Island title={t('Plugins')} icon={Icons.puzzle(14)} grow>
      {plugins.length === 0 ? <Empty>{t('Aucun plugin installé')}</Empty> : (
        <div className="list">
          {plugins.map((p) => (
            <div key={p.manifest.id} className="lrow" title={p.dir}>
              <span className="ico" style={{ color: p.error ? 'var(--ct-badge-error)' : 'var(--ct-badge-info)' }}>{Icons.puzzle(12)}</span>
              <div className="lbody">
                <div className="head"><span className="name">{p.manifest.name}</span><span className="badge dim">{p.manifest.version}</span>{p.builtin && <span className="badge dim">{t('intégré')}</span>}</div>
                <div className="desc" style={p.error ? { color: 'var(--ct-badge-error)' } : undefined}>{p.error ?? p.manifest.description ?? p.manifest.id}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Island>
  )
}
