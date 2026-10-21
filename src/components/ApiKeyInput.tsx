import { useState } from 'react'
import { VERIFY_STATUS_RESET_DELAY_MS } from '../constants/ui'
import { useT } from '../store/useAppStore'
import { type NotificationTone, useNotificationStore } from '../store/useNotificationStore'
import type { ProviderConfig, UsageCurrency, UsageTotal } from '../types'
import { tpl } from '../utils/tpl'
import { ProviderCostStats } from './cost/ProviderCostStats'
import { ProviderIcon } from './ProviderIcon'
import { CredentialCard } from './ui/CredentialCard'

interface ApiKeyInputProps {
  provider: ProviderConfig
  onSave: (key: string) => Promise<void>
  onDelete: () => Promise<void>
  hasKey: boolean
  maskedKey: string | null
  /** Aggregate usage stats for this provider (total spend, tokens, requests). */
  usageTotal?: UsageTotal
  usageCurrency: UsageCurrency
  usageLabel: string
  /** Reset cost statistics for this provider only. */
  onResetUsage: () => void
}

type VerifyStatus =
  | 'idle'
  | 'verifying'
  | 'valid'
  | 'rate_limited'
  | 'billing'
  | 'permission'
  | 'invalid'
  | 'network_error'

export function ApiKeyInput({
  provider,
  onSave,
  onDelete,
  hasKey,
  maskedKey,
  usageTotal,
  usageCurrency,
  usageLabel,
  onResetUsage,
}: ApiKeyInputProps) {
  const t = useT()
  const [inputValue, setInputValue] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('idle')
  const notify = useNotificationStore((state) => state.notify)
  const dismissNotification = useNotificationStore((state) => state.dismiss)
  const notificationKey = `settings-api-key-${provider.id}`

  const isVerifying = verifyStatus === 'verifying'
  const isSuccess = ['valid', 'rate_limited', 'billing', 'permission'].includes(verifyStatus)
  const isError = verifyStatus === 'invalid' || verifyStatus === 'network_error'

  /** Verification outcomes go to the toast stack; a saved key's notice clears with its badge. */
  const report = (status: VerifyStatus, message: string) => {
    const tone: NotificationTone =
      status === 'valid'
        ? 'success'
        : ['rate_limited', 'billing', 'permission', 'network_error'].includes(status)
          ? 'warning'
          : 'error'
    notify({
      key: notificationKey,
      tone,
      message,
      durationMs: status === 'invalid' || status === 'network_error' ? null : VERIFY_STATUS_RESET_DELAY_MS,
    })
  }

  const saveVerifiedKey = async (status: VerifyStatus, message: string) => {
    await onSave(inputValue.trim())
    setVerifyStatus(status)
    report(status, message)
    setInputValue('')
    setTimeout(() => setVerifyStatus('idle'), VERIFY_STATUS_RESET_DELAY_MS)
  }

  const handleVerify = async () => {
    if (!inputValue.trim()) return
    setVerifyStatus('verifying')
    dismissNotification(notificationKey)
    try {
      const result = await window.api.verifyKey(provider.id, inputValue.trim())
      if (result.success) {
        await saveVerifiedKey('valid', t.settings_msg_valid)
      } else {
        switch (result.errorCode) {
          case 'RATE_LIMIT':
            await saveVerifiedKey('rate_limited', t.settings_msg_rate_limited)
            break
          case 'BILLING':
            await saveVerifiedKey('billing', t.settings_msg_billing)
            break
          case 'PERMISSION':
            await saveVerifiedKey('permission', t.settings_msg_permission)
            break
          case 'INVALID_KEY':
            setVerifyStatus('invalid')
            report('invalid', t.settings_msg_invalid)
            break
          case 'NETWORK':
            setVerifyStatus('network_error')
            report('network_error', t.settings_msg_network)
            break
          default:
            setVerifyStatus('invalid')
            report('invalid', result.error ?? 'Verification failed')
        }
      }
    } catch (err) {
      setVerifyStatus('invalid')
      report('invalid', err instanceof Error ? err.message : 'Unexpected error')
    }
  }

  const handleDelete = async () => {
    if (!confirm(`${t.settings_remove} API key for ${provider.name}?`)) return
    setIsDeleting(true)
    setVerifyStatus('idle')
    dismissNotification(notificationKey)
    setInputValue('')
    try {
      await onDelete()
    } catch (err) {
      setVerifyStatus('invalid')
      report('invalid', err instanceof Error ? err.message : t.settings_key_store_failed)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleResetUsage = () => {
    if (!usageTotal || usageTotal.requestCount === 0) return
    if (!window.confirm(tpl(t.settings_cost_reset_provider_confirm, { name: provider.name }))) return
    onResetUsage()
  }

  return (
    <CredentialCard
      icon={<ProviderIcon provider={provider.id} size={22} />}
      title={provider.name}
      docsLabel={t.settings_get_key}
      labels={{
        saved: t.settings_key_saved,
        empty: t.settings_no_key,
        invalid: t.settings_key_invalid,
        remove: t.settings_remove,
        verifying: t.settings_verifying,
        verified: t.settings_verified,
        tryAgain: t.settings_try_again,
        submit: t.settings_verify_save,
      }}
      inputValue={inputValue}
      maskedValue={maskedKey}
      placeholder={hasKey ? t.settings_key_placeholder_new : tpl(t.settings_key_placeholder_paste, { name: provider.name })}
      meta={(
        <ProviderCostStats
          total={usageTotal}
          currency={usageCurrency}
          costLabel={usageLabel}
          t={t}
          onReset={handleResetUsage}
          resetTitle={tpl(t.settings_cost_reset_provider_confirm, { name: provider.name })}
        />
      )}
      hasSecret={hasKey}
      isBusy={isVerifying}
      isSuccess={isSuccess}
      isError={isError}
      isDeleting={isDeleting}
      onOpenDocs={() => window.api?.openExternal(provider.docsUrl)}
      onInputChange={setInputValue}
      onSubmit={handleVerify}
      onDelete={handleDelete}
      onStatusReset={() => {
        if (verifyStatus !== 'idle') setVerifyStatus('idle')
      }}
    />
  )
}
