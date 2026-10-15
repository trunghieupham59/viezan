import { type ReactNode, useEffect, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { CredentialSecretInputRow, CredentialStatusBadge, CredentialStatusMessage } from '../../components/ui/CredentialCard'
import {
  AutoModeIcon,
  ElevenLabsIcon,
  MicrosoftEdgeIcon,
  PremiumModeIcon,
} from '../../components/ui/icons'
import { TtsVoicePicker } from '../../components/ui/TtsVoicePicker'
import { TOAST_DISMISS_DELAY_MS } from '../../constants/ui'
import { ELEVENLABS_DOCS_URL } from '../../constants/urls'
import { useAppStore, useT } from '../../store/useAppStore'
import type { TtsMode } from '../../types'

function ProviderLogoFrame({
  children,
  selected,
}: {
  children: ReactNode
  selected: boolean
}) {
  return (
    <span
      className={[
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
        selected
          ? 'border-gray-200 bg-white text-gray-950 dark:border-gray-900 dark:bg-gray-950 dark:text-white'
          : 'border-gray-200 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

export function TtsSection() {
  const ttsMode = useAppStore((state) => state.ttsMode)
  const ttsVoice = useAppStore((state) => state.ttsVoice)
  const setTtsMode = useAppStore((state) => state.setTtsMode)
  const setTtsVoice = useAppStore((state) => state.setTtsVoice)
  const t = useT()

  // ── ElevenLabs key state ────────────────────────────────────────────────────
  const [elKey, setElKey]         = useState({ exists: false, masked: null as string | null })
  const [elInput, setElInput]     = useState('')
  const [elSaving, setElSaving]   = useState(false)
  const [elDeleting, setElDeleting] = useState(false)
  const [elMsg, setElMsg]         = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (!window.api) return
    window.api.keychain.get('elevenlabs').then((r) => {
      setElKey({ exists: r.exists ?? false, masked: r.masked ?? null })
    }).catch(() => {})
  }, [])

  const showMasked = elKey.exists && elInput === ''

  const handleElSave = async () => {
    if (!elInput.trim() || !window.api) return
    setElSaving(true)
    setElMsg(null)
    try {
      const result = await window.api.keychain.save('elevenlabs', elInput.trim())
      if (result.success) {
        const updated = await window.api.keychain.get('elevenlabs')
        setElKey({ exists: updated.exists ?? false, masked: updated.masked ?? null })
        setElInput('')
        setElMsg({ text: t.settings_tts_el_saved, ok: true })
        setTimeout(() => setElMsg(null), TOAST_DISMISS_DELAY_MS)
      } else {
        setElMsg({ text: `✗ ${result.error ?? t.settings_tts_el_failed}`, ok: false })
      }
    } catch (err) {
      setElMsg({ text: `✗ ${err instanceof Error ? err.message : t.settings_tts_el_failed}`, ok: false })
    } finally {
      setElSaving(false)
    }
  }

  const handleElDelete = async () => {
    if (!window.api || !confirm(t.settings_tts_el_delete_confirm)) return
    setElDeleting(true)
    try {
      await window.api.keychain.delete('elevenlabs')
      setElKey({ exists: false, masked: null })
      setElInput('')
      setElMsg(null)
    } finally {
      setElDeleting(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="section-label">{t.settings_tts_section}</h2>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">

        {/* TTS mode selector — default free-first to avoid paid API calls */}
        <div className="px-4 py-3.5 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_tts_mode}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_tts_mode_desc}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              {
                mode: 'free',
                label: t.settings_tts_mode_free,
                desc: t.settings_tts_mode_free_desc,
                icon: <MicrosoftEdgeIcon size={21} />,
              },
              {
                mode: 'auto',
                label: t.settings_tts_mode_auto,
                desc: t.settings_tts_mode_auto_desc,
                icon: <AutoModeIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />,
              },
              {
                mode: 'premium',
                label: t.settings_tts_mode_premium,
                desc: t.settings_tts_mode_premium_desc,
                icon: <PremiumModeIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />,
              },
            ] as Array<{ mode: TtsMode; label: string; desc: string; icon: ReactNode }>).map(({ mode, label, desc, icon }) => {
              const active = ttsMode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTtsMode(mode)}
                  className={[
                    'btn-secondary btn-choice-card w-full min-h-[116px] gap-2',
                    active
                      ? 'btn-active'
                      : '',
                  ].join(' ')}
                  aria-pressed={active}
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <ProviderLogoFrame selected={active}>
                      {icon}
                    </ProviderLogoFrame>
                    <span className="block min-w-0 text-sm font-semibold leading-snug pt-0.5">{label}</span>
                  </span>
                  <span className={[
                    'block min-w-0 text-xs leading-snug',
                    active ? 'text-gray-600 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400',
                  ].join(' ')}>
                    {desc}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Voice selector — applies when OpenAI is the active provider */}
        <div className="px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_tts_voice}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_tts_voice_desc}</p>
          </div>
        </div>

        {/* Voice preview badges */}
        <TtsVoicePicker value={ttsVoice} onChange={setTtsVoice} />

        {/* ElevenLabs API key */}
        <div className="px-4 py-3.5 space-y-2">
          {/* Header: title + link on left, badge on right */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <ProviderLogoFrame selected={false}>
                <ElevenLabsIcon size={21} />
              </ProviderLogoFrame>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {t.settings_tts_elevenlabs_key}
                </h3>
                <Button
                  size="md"
                  shape="rect"
                  variant="neutral"
                  appearance="ghost"
                  type="button"
                  onClick={() => window.api?.openExternal(ELEVENLABS_DOCS_URL)}
                >
                  {t.settings_get_key}
                </Button>
              </div>
            </div>
            <CredentialStatusBadge
              hasSecret={elKey.exists}
              labels={{
                saved: t.settings_key_saved,
                empty: t.settings_no_key,
                invalid: t.settings_key_invalid,
              }}
            />
          </div>

          {/* Input row */}
          <CredentialSecretInputRow
            inputValue={elInput}
            maskedValue={elKey.masked}
            showMasked={showMasked}
            placeholder={elKey.exists ? t.settings_key_placeholder_new : t.settings_tts_el_key_placeholder}
            hasSecret={elKey.exists}
            isBusy={elSaving}
            isDeleting={elDeleting}
            labels={{
              remove: t.settings_remove,
              verifying: t.settings_verifying,
              verified: t.settings_verified,
              tryAgain: t.settings_try_again,
              submit: t.settings_verify_save,
            }}
            onInputChange={(value) => {
              setElInput(value)
              if (elMsg) setElMsg(null)
            }}
            onSubmit={handleElSave}
            onDelete={handleElDelete}
          />

          {/* Result message */}
          {elMsg && <CredentialStatusMessage message={elMsg.text} tone={elMsg.ok ? 'success' : 'error'} />}
        </div>

      </div>
    </section>
  )
}
