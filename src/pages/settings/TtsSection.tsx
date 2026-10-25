import { useEffect, useState } from 'react'
import { ButtonGroup } from '../../components/ui/ButtonGroup'
import { CredentialCard } from '../../components/ui/CredentialCard'
import { SelectField, SettingsRow } from '../../components/ui/molecules'
import { ELEVENLABS_DOCS_URL } from '../../constants/urls'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import type { TtsMode, TtsVoice } from '../../types'
import { tpl } from '../../utils/tpl'

const VOICES: TtsVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']

/** The read-aloud rows of Settings › Voice: mode, voice and the ElevenLabs key. */
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
  const notify = useNotificationStore((state) => state.notify)
  /** Save outcomes go to the toast stack; one key so results never pile up. */
  const reportElevenLabs = (message: string, ok: boolean) =>
    notify({ key: 'settings-elevenlabs-key', tone: ok ? 'success' : 'error', message })

  useEffect(() => {
    if (!window.api) return
    window.api.keychain.get('elevenlabs').then((r) => {
      setElKey({ exists: r.exists ?? false, masked: r.masked ?? null })
    }).catch(() => {})
  }, [])

  const handleElSave = async () => {
    if (!elInput.trim() || !window.api) return
    setElSaving(true)
    try {
      const result = await window.api.keychain.save('elevenlabs', elInput.trim())
      if (result.success) {
        const updated = await window.api.keychain.get('elevenlabs')
        setElKey({ exists: updated.exists ?? false, masked: updated.masked ?? null })
        setElInput('')
        reportElevenLabs(t.settings_tts_el_saved, true)
      } else {
        reportElevenLabs(result.error ?? t.settings_tts_el_failed, false)
      }
    } catch (err) {
      reportElevenLabs(err instanceof Error ? err.message : t.settings_tts_el_failed, false)
    } finally {
      setElSaving(false)
    }
  }

  const handleElDelete = async () => {
    if (!window.api || !window.confirm(tpl(t.settings_remove_key_confirm, { name: 'ElevenLabs' }))) return
    setElDeleting(true)
    try {
      const removed = await window.api.keychain.delete('elevenlabs')
      if (!removed.success) {
        reportElevenLabs(t.settings_key_store_failed, false)
        return
      }
      setElKey({ exists: false, masked: null })
      setElInput('')
    } catch {
      reportElevenLabs(t.settings_key_store_failed, false)
    } finally {
      setElDeleting(false)
    }
  }

  const modes: { value: TtsMode; label: string }[] = [
    { value: 'free', label: t.settings_tts_mode_free },
    { value: 'auto', label: t.settings_tts_mode_auto },
    { value: 'premium', label: t.settings_tts_mode_premium },
  ]
  const modeDescriptions: Record<TtsMode, string> = {
    free: t.settings_tts_mode_free_desc,
    auto: t.settings_tts_mode_auto_desc,
    premium: t.settings_tts_mode_premium_desc,
  }

  return (
    <>
      {/* Default free-first to avoid paid API calls */}
      <SettingsRow
        label={t.settings_tts_section}
        description={(
          <>
            {t.settings_tts_mode_desc}
            <span className="settings-row-hint">{modeDescriptions[ttsMode]}</span>
          </>
        )}
      >
        <ButtonGroup<TtsMode>
          size="sm"
          label={t.settings_tts_mode}
          value={ttsMode}
          onChange={setTtsMode}
          options={modes}
        />
      </SettingsRow>

      <SettingsRow label={t.settings_tts_voice} description={t.settings_tts_voice_desc}>
        <SelectField
          label={t.settings_tts_voice}
          value={ttsVoice}
          options={VOICES.map((voice) => ({ value: voice, label: voice.charAt(0).toUpperCase() + voice.slice(1) }))}
          onChange={(value) => setTtsVoice(value as TtsVoice)}
          className="settings-select-field"
        />
      </SettingsRow>

      <CredentialCard
        title={t.settings_tts_elevenlabs_key}
        docsLabel={t.settings_get_key}
        labels={{
          saved: t.settings_key_saved,
          edit: t.settings_key_edit,
          add: t.settings_key_add,
          empty: t.settings_no_key,
          invalid: t.settings_key_invalid,
          remove: t.settings_remove,
          // The ElevenLabs key is stored as-is, never verified.
          verifying: t.settings_key_saving,
          verified: t.settings_verified,
          tryAgain: t.settings_try_again,
          submit: t.settings_key_save,
        }}
        meta={<span>{t.settings_tts_elevenlabs_for_premium}</span>}
        inputValue={elInput}
        maskedValue={elKey.masked}
        placeholder={elKey.exists ? t.settings_key_placeholder_new : t.settings_tts_el_key_placeholder}
        hasSecret={elKey.exists}
        isBusy={elSaving}
        isDeleting={elDeleting}
        onOpenDocs={() => window.api?.openExternal(ELEVENLABS_DOCS_URL)}
        onInputChange={setElInput}
        onSubmit={handleElSave}
        onDelete={handleElDelete}
      />
    </>
  )
}
