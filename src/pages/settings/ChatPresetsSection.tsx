import { type KeyboardEvent, useRef, useState } from 'react'
import { Button, Input, Textarea } from '@/components/ui/atoms'
import { SettingsCard, SettingsRow } from '@/components/ui/molecules'
import { ButtonGroup } from '../../components/ui/ButtonGroup'
import { HotkeyRecordButton } from '../../components/ui/HotkeyRecordButton'
import { PlusIcon, XIcon } from '../../components/ui/icons'
import { PresetActions } from '../../components/ui/PresetActions'
import { SettingsFormActions } from '../../components/ui/SettingsFormActions'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import type { ChatSendShortcut, SystemPromptPreset } from '../../types'
import { DEFAULT_CHAT_NEW_SESSION_SHORTCUT, formatShortcutLabel, keyEventToAccelerator } from '../../utils/keyboardShortcuts'
import { tpl } from '../../utils/tpl'
import { ChatImageStorageCard } from './ChatImageStorageCard'

export function ChatPresetsSection() {
  const systemPromptPresets = useAppStore((state) => state.systemPromptPresets)
  const addSystemPromptPreset = useAppStore((state) => state.addSystemPromptPreset)
  const updateSystemPromptPreset = useAppStore((state) => state.updateSystemPromptPreset)
  const deleteSystemPromptPreset = useAppStore((state) => state.deleteSystemPromptPreset)
  const setDefaultSystemPromptPreset = useAppStore((state) => state.setDefaultSystemPromptPreset)
  const setChatSystemPrompt = useAppStore((state) => state.setChatSystemPrompt)
  const chatSendShortcut = useAppStore((state) => state.chatSendShortcut)
  const chatNewSessionShortcut = useAppStore((state) => state.chatNewSessionShortcut)
  const setChatSendShortcut = useAppStore((state) => state.setChatSendShortcut)
  const setChatNewSessionShortcut = useAppStore((state) => state.setChatNewSessionShortcut)
  const notify = useNotificationStore((state) => state.notify)
  const t = useT()

  const [isRecordingNewChatShortcut, setIsRecordingNewChatShortcut] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [newPresetContent, setNewPresetContent] = useState('')
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editContent, setEditContent] = useState('')
  const newChatShortcutRef = useRef<HTMLButtonElement>(null)
  const platform = window.api?.platform
  const modLabel = platform === 'darwin' ? 'Cmd' : 'Ctrl'

  const handleAddPreset = () => {
    if (!newPresetName.trim() || !newPresetContent.trim()) return
    addSystemPromptPreset({ name: newPresetName.trim(), content: newPresetContent.trim() })
    setNewPresetName('')
    setNewPresetContent('')
    setShowAddForm(false)
  }

  const startEdit = (preset: SystemPromptPreset) => {
    setEditingPresetId(preset.id)
    setEditName(preset.name)
    setEditContent(preset.content)
  }

  const saveEdit = () => {
    if (!editingPresetId || !editName.trim() || !editContent.trim()) return
    updateSystemPromptPreset(editingPresetId, { name: editName.trim(), content: editContent.trim() })
    setEditingPresetId(null)
  }

  const cancelEdit = () => setEditingPresetId(null)

  const applyPreset = (preset: SystemPromptPreset) => {
    setChatSystemPrompt(preset.content)
    notify({ key: 'settings-chat-preset', tone: 'success', message: tpl(t.settings_chat_preset_applied, { name: preset.name }) })
  }

  /** Deleting cannot be undone, so it asks first. */
  const deletePreset = (preset: SystemPromptPreset) => {
    if (!window.confirm(tpl(t.settings_chat_preset_delete_confirm, { name: preset.name }))) return
    if (editingPresetId === preset.id) setEditingPresetId(null)
    deleteSystemPromptPreset(preset.id)
  }

  const handleNewChatShortcutKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (e.key === 'Escape') {
      setIsRecordingNewChatShortcut(false)
      return
    }

    const shortcut = keyEventToAccelerator(e.nativeEvent)
    if (!shortcut) return
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !/^F(?:[1-9]|1\d|2[0-4])$/.test(e.key)) return

    setChatNewSessionShortcut(shortcut)
    setIsRecordingNewChatShortcut(false)
  }

  const presetForm = (
    name: string,
    setName: (value: string) => void,
    content: string,
    setContent: (value: string) => void,
    onCancel: () => void,
    onSubmit: () => void,
  ) => (
    <div className="settings-preset-form">
      <Input
        size="sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t.settings_chat_preset_name_placeholder}
        aria-label={t.settings_chat_preset_name_placeholder}
      />
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t.chat_system_prompt_placeholder}
        aria-label={t.chat_system_prompt_placeholder}
        rows={3}
      />
      <SettingsFormActions
        onCancel={onCancel}
        onSubmit={onSubmit}
        cancelLabel={t.settings_chat_preset_cancel}
        submitLabel={t.settings_chat_preset_save}
        disabled={!name.trim() || !content.trim()}
        size="sm"
      />
    </div>
  )

  return (
    <div className="settings-section-stack">
      <header>
        <h2 className="settings-section-title">{t.settings_chat_section}</h2>
        <p className="settings-section-desc">{t.settings_chat_section_desc}</p>
      </header>

      {/* One card as in the design: presets, then the send key and stored images. */}
      <SettingsCard title={t.settings_chat_presets} headingLevel={3}>
        {systemPromptPresets.map((preset) => (
          <SettingsRow
            key={preset.id}
            label={(
              <span className="settings-preset-name">
                {preset.name}
                {preset.isDefault && <span className="settings-tag">{t.settings_chat_preset_is_default}</span>}
              </span>
            )}
            description={<span className="settings-preset-content">{preset.content}</span>}
            below={editingPresetId === preset.id
              ? presetForm(editName, setEditName, editContent, setEditContent, cancelEdit, saveEdit)
              : undefined}
          >
            <PresetActions
              isDefault={preset.isDefault ?? false}
              onSetDefault={() => {
                setDefaultSystemPromptPreset(preset.id)
                setChatSystemPrompt(preset.content)
              }}
              onApply={() => applyPreset(preset)}
              onEdit={() => startEdit(preset)}
              onDelete={() => deletePreset(preset)}
              setDefaultTitle={t.settings_chat_preset_set_default}
              applyTitle={t.settings_preset_use_prompt}
              editTitle={t.settings_chat_preset_edit}
              deleteTitle={t.settings_chat_preset_delete}
            />
          </SettingsRow>
        ))}
        <SettingsRow
          label={systemPromptPresets.length === 0 ? t.settings_chat_presets_empty : ''}
          below={showAddForm
            ? presetForm(
                newPresetName,
                setNewPresetName,
                newPresetContent,
                setNewPresetContent,
                () => { setShowAddForm(false); setNewPresetName(''); setNewPresetContent('') },
                handleAddPreset,
              )
            : undefined}
        >
          <Button
            size="sm"
            shape="rect"
            variant="neutral"
            appearance={showAddForm ? 'soft' : 'outline'}
            type="button"
            aria-expanded={showAddForm}
            onClick={() => { setShowAddForm((v) => !v); setEditingPresetId(null) }}
          >
            <PlusIcon />
            {t.settings_chat_preset_add}
          </Button>
        </SettingsRow>
        <SettingsRow label={t.settings_chat_shortcut_send} description={t.settings_chat_shortcut_send_desc}>
          <ButtonGroup<ChatSendShortcut>
            size="sm"
            label={t.settings_chat_shortcut_send}
            value={chatSendShortcut}
            onChange={setChatSendShortcut}
            options={[
              { value: 'enter', label: t.settings_chat_shortcut_send_enter },
              { value: 'modEnter', label: tpl(t.settings_chat_shortcut_send_mod_enter, { mod: modLabel }) },
            ]}
          />
        </SettingsRow>

        <SettingsRow label={t.settings_chat_shortcut_new_chat} description={t.settings_chat_shortcut_new_chat_desc}>
          {chatNewSessionShortcut && !isRecordingNewChatShortcut && (
            <Button
              size="md"
              shape="icon"
              variant="danger"
              appearance="ghost"
              aria-label={t.settings_hotkey_clear}
              type="button"
              onClick={() => setChatNewSessionShortcut('')}
              title={t.settings_hotkey_clear}
            >
              <XIcon />
            </Button>
          )}
          {!chatNewSessionShortcut && !isRecordingNewChatShortcut && (
            <Button
              size="md"
              shape="rect"
              variant="neutral"
              appearance="outline"
              type="button"
              onClick={() => setChatNewSessionShortcut(DEFAULT_CHAT_NEW_SESSION_SHORTCUT)}
            >
              {t.settings_chat_shortcut_restore_default}
            </Button>
          )}
          <HotkeyRecordButton
            inputRef={newChatShortcutRef}
            isRecording={isRecordingNewChatShortcut}
            value={formatShortcutLabel(chatNewSessionShortcut, platform)}
            onKeyDown={handleNewChatShortcutKeyDown}
            onClick={() => setIsRecordingNewChatShortcut(true)}
            onBlur={() => setIsRecordingNewChatShortcut(false)}
            recordingText={t.settings_hotkey_recording}
            noneText={t.settings_hotkey_none}
          />
        </SettingsRow>

        <ChatImageStorageCard />
      </SettingsCard>
    </div>
  )
}
