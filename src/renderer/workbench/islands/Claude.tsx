import { useEffect, useState, type ReactNode } from 'react'
import type { ClaudeInfo, UsageState } from '@shared/ipc'
import { level, untilReset, type UsageLimit } from '@shared/usage'
import { modelName } from '@shared/models'
import { STATUS_PAGE, statusLabel, statusTone, updateAvailable } from '@shared/claude-info'
import { Icons } from '../icons'
import { Island } from '../Island'
import { useWorkbench } from '@/stores/workbench'
import { t } from '@/i18n'

const ARTIFACTS = 'https://claude.ai/code/artifacts'

/**
 * Claude panel (right, global only: nothing that depends on a session), in blocks like the settings: subscription
 * usage (usage API + status line), Claude Code (plan, version and update, default model), Anthropic services, artifacts.
 */
export function ClaudeIsland() {
  const [usage, setUsage] = useState<UsageState | null>(null)
  const [info, setInfo] = useState<ClaudeInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(Date.now())
  const activeProjectId = useWorkbench((s) => s.activeProjectId)
  const root = useWorkbench((s) => s.projects.find((p) => p.id === s.activeProjectId)?.root ?? null)
  const refresh = async (force: boolean) => {
    setLoading(true)
    const [, i] = await Promise.all([force ? window.ct.usage.refresh() : Promise.resolve(), window.ct.usage.claude(force)])
    setInfo(i); setLoading(false)
  }
  useEffect(() => {
    const off = window.ct.usage.onChanged(setUsage)
    // the usage API is asked when the panel opens, at most every 10 min (and on the button)
    window.ct.usage.state().then((s) => { setUsage(s); if (!s.api?.at || Date.now() - s.api.at > 10 * 60_000) window.ct.usage.refresh() })
    refresh(false)
    const tick = setInterval(() => setNow(Date.now()), 30_000)   // reset delays and "il y a"
    return () => { off(); clearInterval(tick) }
  }, [])
  const install = async (on: boolean) => { const r = await window.ct.usage.install(on); setError(r.ok ? null : r.error ?? 'erreur') }
  const update = () => { if (activeProjectId) useWorkbench.getState().runCommand(activeProjectId, root ?? window.ct.home, [['claude', 'update']], 'new') }
  const snap = usage?.snapshot
  const newer = updateAvailable(info?.version, info?.latest)
  const busy = loading || !!usage?.api?.busy
  const actions = <button title={t('Actualiser')} disabled={busy} onClick={() => refresh(true)}>{busy ? <span className="spin" /> : Icons.refresh(14)}</button>

  return (
    <Island title={t('Claude')} icon={Icons.gauge(14)} actions={actions} grow dataView="claude">
      <div className="claude-panel">
        <Block title={t("Usage de l'abonnement")}>
          {snap?.limits.length ? snap.limits.map((l) => <div key={l.key} className="cp-row"><Gauge limit={l} now={now} /></div>) : !busy && <div className="cp-row hint">{t('Aucun relevé pour le moment.')}</div>}
          {(snap?.limits.length || usage?.api?.error || error) ? (
            <div className="cp-row foot">
              {snap?.limits.length ? <span className="hint dim">{t('Relevé {ago}', { ago: ago(snap.at, now) })}</span> : null}
              {usage?.api?.error && <span className="error">{usage.api.error}</span>}
              {error && <span className="error">{error}</span>}
            </div>
          ) : null}
          {usage?.foreign ? (
            <div className="cp-row hint dim">{t('Suivi en continu indisponible : une autre ligne de statut est configurée ({c}), ClaudeTerm ne la remplace pas.', { c: usage.foreign })}</div>
          ) : usage && !usage.installed ? (
            <div className="cp-row col">
              <span className="hint">{t("Suivi en continu : Claude Code transmet la session (5 h) et la semaine à sa ligne de statut à chaque réponse. ClaudeTerm en déclare une dans ~/.claude/settings.json, qui n'affiche rien dans le terminal.")}</span>
              <button className="btn" onClick={() => install(true)}>{t('Activer le suivi en continu')}</button>
            </div>
          ) : usage?.installed ? (
            <div className="cp-row"><span className="hint">{t('Suivi en continu actif')}</span><button className="linkbtn" onClick={() => install(false)}>{t('Désactiver')}</button></div>
          ) : null}
        </Block>

        <Block title={t('Claude Code')}>
          {usage?.plan?.subscription && <Row k={t('Abonnement')} v={plan(usage.plan.subscription)} />}
          <Row k={t('Version')} v={info ? info.version ?? t('introuvable') : '…'} extra={info?.version && info.latest ? (newer ? <span className="badge accent">{t('{v} disponible', { v: newer })}</span> : <span className="badge dim">{t('à jour')}</span>) : undefined} />
          {newer && (
            <div className="cp-row col">
              <span className="hint">{t('Lance `claude update` dans un nouvel onglet shell du projet ouvert.')}</span>
              <button className="btn primary" disabled={!activeProjectId} onClick={update}>{Icons.download(13)} {t('Mettre à jour Claude Code')}</button>
            </div>
          )}
          <Row k={t('Modèle par défaut')} v={info ? (info.model ? modelName(info.model) : t('celui du compte')) : '…'} />
        </Block>

        <Block title={t('Services Anthropic')}>
          {!info ? <div className="cp-row hint">…</div> : info.status ? (
            <>
              <div className={'cp-row status ' + statusTone(info.status.indicator)}><span className="dot" /><span>{info.status.indicator === 'none' ? t('Tous les services fonctionnent') : info.status.description}</span></div>
              {info.status.degraded.map((c) => <Row key={c.name} k={c.name} v={t(statusLabel(c.status))} tone="warn" />)}
              {info.status.incidents.map((i) => (
                <button key={i.name} className="cp-row link incident" onClick={() => i.url && window.ct.app.openUrl(i.url)} title={i.url}>
                  <span className="name">{i.name}</span><span className="hint">{t(statusLabel(i.status))}</span>
                </button>
              ))}
            </>
          ) : <div className="cp-row error">{t('Page de statut indisponible : {e}', { e: info.error ?? '' })}</div>}
          <button className="cp-row link" onClick={() => window.ct.app.openUrl(STATUS_PAGE)}><span>status.claude.com</span>{Icons.external(12)}</button>
        </Block>

        <Block title={t('Artifacts')}>
          <div className="cp-row col">
            <span className="hint">{t('Les artifacts publiés depuis tes sessions et ceux partagés avec toi, sur claude.ai.')}</span>
            <button className="btn" onClick={() => window.ct.app.openUrl(ARTIFACTS)}>{Icons.external(13)} {t('Voir les artifacts')}</button>
          </div>
        </Block>
      </div>
    </Island>
  )
}

const Block = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="sgroup"><div className="sgroup-title">{title}</div><div className="sgroup-body">{children}</div></div>
)

function Gauge({ limit, now }: { limit: UsageLimit; now: number }) {
  const lv = level(limit.percent)
  const reset = untilReset(limit.resetsAt, now)
  return (
    <div className={'gauge ' + lv.tone} title={limit.resetsAt ? new Date(limit.resetsAt).toLocaleString() : undefined}>
      <div className="gauge-head"><span className="name">{t(limit.label)}</span><span className="pct">{Math.round(limit.percent)} %{lv.text && <em> · {t(lv.text)}</em>}</span></div>
      <div className="bar"><div style={{ width: `${limit.percent}%` }} /></div>
      {reset && <div className="reset">{t('Réinitialisation {when}', { when: t(reset) })}</div>}
    </div>
  )
}

const Row = ({ k, v, mono, extra, tone }: { k: string; v: string; mono?: boolean; extra?: ReactNode; tone?: 'warn' }) => (
  <div className={'cp-row kv' + (tone ? ' ' + tone : '')}><span className="k">{k}</span><span className="v-wrap">{extra}<span className={'v' + (mono ? ' mono' : '')}>{v}</span></span></div>
)

const plan = (s: string) => ({ pro: 'Pro', max: 'Max', team: 'Team', enterprise: 'Enterprise', free: 'Gratuit' } as Record<string, string>)[s.toLowerCase()] ?? s

function ago(at: number, now: number): string {
  const min = Math.round((now - at) / 60000)
  if (min < 1) return t("à l'instant")
  if (min < 60) return t('il y a {n} min', { n: min })
  const h = Math.round(min / 60)
  return h < 24 ? t('il y a {n} h', { n: h }) : new Date(at).toLocaleString()
}
