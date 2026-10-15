import { type KeyboardEvent, useRef, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { ButtonGroup } from '../../components/ui/ButtonGroup'
import { HotkeyRecordButton } from '../../components/ui/HotkeyRecordButton'
import { PlusIcon, XIcon } from '../../components/ui/icons'
import { PresetActions } from '../../components/ui/PresetActions'
import { SettingsFormActions } from '../../components/ui/SettingsFormActions'
import { useAppStore, useT } from '../../store/useAppStore'
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

  return (
    <section className="space-y-3">
      <h2 className="section-label">{t.settings_chat_section}</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">{t.settings_chat_section_desc}</p>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">
        <div className="px-4 py-3.5">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_chat_shortcuts}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_chat_shortcuts_desc}</p>
        </div>

        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_chat_shortcut_send}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_chat_shortcut_send_desc}</p>
          </div>
          <ButtonGroup<ChatSendShortcut>
            value={chatSendShortcut}
            onChange={setChatSendShortcut}
            options={[
              { value: 'enter', label: t.settings_chat_shortcut_send_enter },
              { value: 'modEnter', label: tpl(t.settings_chat_shortcut_send_mod_enter, { mod: modLabel }) },
            ]}
            containerClassName="flex-shrink-0"
          />
        </div>

        <div className="px-4 py-3.5 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_chat_shortcut_new_chat}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_chat_shortcut_new_chat_desc}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {chatNewSessionShortcut && !isRecordingNewChatShortcut && (
                <Button
                  size="md"
                  shape="icon"
                  variant="danger"
                  appearance="soft"
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
            </div>
          </div>
        </div>
      </div>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">
        <div className="px-4 py-3.5 space-y-3">

          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_chat_presets}</p>
            <Button
              size="md"
              shape="rect"
              variant="neutral"
              appearance="outline"
              type="button"
              onClick={() => { setShowAddForm((v) => !v); setEditingPresetId(null) }}
            >
              <PlusIcon />
              {t.settings_chat_preset_add}
            </Button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-2 border border-gray-200 dark:border-gray-700">
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder={t.settings_chat_preset_name_placeholder}
                className="w-full text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600
                           rounded-lg px-3 py-1.5 outline-none focus:border-gray-400 dark:focus:border-gray-600
                           text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
              />
              <textarea
                value={newPresetContent}
                onChange={(e) => setNewPresetContent(e.target.value)}
                placeholder={t.chat_system_prompt_placeholder}
                rows={3}
                className="w-full text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600
                           rounded-lg px-3 py-1.5 outline-none resize-none focus:border-gray-400 dark:focus:border-gray-600
                           text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
              />
              <SettingsFormActions
                onCancel={() => { setShowAddForm(false); setNewPresetName(''); setNewPresetContent('') }}
                onSubmit={handleAddPreset}
                cancelLabel={t.settings_chat_preset_cancel}
                submitLabel={t.settings_chat_preset_save}
                disabled={!newPresetName.trim() || !newPresetContent.trim()}
                size="md"
              />
            </div>
          )}

          {/* Preset list */}
          {systemPromptPresets.length === 0 && !showAddForm ? (
            <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-2">{t.settings_chat_presets_empty}</p>
          ) : (
            <div className="space-y-2">
              {systemPromptPresets.map((preset) => (
                <div key={preset.id} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {editingPresetId === preset.id ? (
                    /* Edit mode */
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder={t.settings_chat_preset_name_placeholder}
                        className="w-full text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600
                                   rounded-lg px-3 py-1.5 outline-none focus:border-gray-400 dark:focus:border-gray-600
                                   text-gray-800 dark:text-gray-200 placeholder-gray-400"
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                        className="w-full text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600
                                   rounded-lg px-3 py-1.5 outline-none resize-none focus:border-gray-400 dark:focus:border-gray-600
                                   text-gray-800 dark:text-gray-200"
                      />
                      <SettingsFormActions
                        onCancel={cancelEdit}
                        onSubmit={saveEdit}
                        cancelLabel={t.settings_chat_preset_cancel}
                        submitLabel={t.settings_chat_preset_save}
                        disabled={!editName.trim() || !editContent.trim()}
                        size="md"
                      />
                    </div>
                  ) : (
                    /* View mode */
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-white dark:bg-gray-800/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{preset.name}</span>
                          {preset.isDefault && (
                            <span className="ui-badge-xs font-medium text-gray-600 dark:bg-gray-900/50 dark:text-gray-400">
                              {t.settings_chat_preset_is_default}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{preset.content}</p>
                      </div>
                      <PresetActions
                        isDefault={preset.isDefault ?? false}
                        onSetDefault={() => {
                          setDefaultSystemPromptPreset(preset.id)
                          setChatSystemPrompt(preset.content)
                        }}
                        onApply={() => setChatSystemPrompt(preset.content)}
                        onEdit={() => startEdit(preset)}
                        onDelete={() => deleteSystemPromptPreset(preset.id)}
                        setDefaultTitle={t.settings_chat_preset_set_default}
                        applyTitle={t.settings_preset_use_prompt}
                        editTitle={t.settings_chat_preset_edit}
                        deleteTitle={t.settings_chat_preset_delete}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      <ChatImageStorageCard />
    </section>
  )
}
