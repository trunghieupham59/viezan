import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/atoms'
import type { Translations } from '../../i18n'
import type { SystemPromptPreset } from '../../types'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentIcon,
  PlusIcon,
  RadioCheckedIcon,
  XIcon,
} from '../ui/icons'

interface SystemPromptDropdownProps {
  chatSystemPrompt: string
  systemPromptPresets: SystemPromptPreset[]
  activePreset: SystemPromptPreset | null
  onSetChatSystemPrompt: (prompt: string) => void
  onNavigateSettings: () => void
  onAddPreset: (preset: Omit<SystemPromptPreset, 'id'>) => string
  t: Translations
  compact?: boolean
}

export function SystemPromptDropdown({
  chatSystemPrompt,
  systemPromptPresets,
  activePreset,
  onSetChatSystemPrompt,
  onNavigateSettings,
  onAddPreset,
  t,
  compact = false,
}: SystemPromptDropdownProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newContent, setNewContent] = useState('')
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const isActive = Boolean(chatSystemPrompt || activePreset)

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setShowDropdown(true)
  }

  // Close when clicking outside (trigger OR portal panel)
  useEffect(() => {
    if (!showDropdown) return
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setShowDropdown(false)
        setShowAddForm(false)
        setNewName('')
        setNewContent('')
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showDropdown])

  // Focus name input when form opens
  useEffect(() => {
    if (showAddForm) {
      setTimeout(() => nameInputRef.current?.focus(), 50)
    }
  }, [showAddForm])

  const handleOpenAddForm = () => {
    setNewName('')
    setNewContent('')
    setShowAddForm(true)
  }

  const handleCancelAdd = () => {
    setShowAddForm(false)
    setNewName('')
    setNewContent('')
  }

  const handleSavePreset = () => {
    const name = newName.trim()
    const content = newContent.trim()
    if (!name || !content) return
    onAddPreset({ name, content, isDefault: false })
    setShowAddForm(false)
    setNewName('')
    setNewContent('')
    onSetChatSystemPrompt(content)
    setShowDropdown(false)
  }

  const panel = showDropdown && createPortal(
    <div
      ref={panelRef}
      className="floating-panel overflow-hidden"
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        right: dropdownPos.right,
        width: 288,
        zIndex: 9999,
      }}
    >
      <p className="ui-kicker border-b border-gray-100 px-3 py-1.5 dark:border-gray-700">
        {t.settings_chat_presets}
      </p>

      <button
        type="button"
        onClick={() => { onSetChatSystemPrompt(''); setShowDropdown(false) }}
        className={`btn-menu-item justify-start text-left ${!chatSystemPrompt ? 'btn-active' : ''}`}
      >
        <div className="flex-1 min-w-0">
          <span className="font-medium">{t.chat_system_prompt_none}</span>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t.chat_system_prompt_none_desc}</p>
        </div>
        {!chatSystemPrompt && <RadioCheckedIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />}
      </button>

      <div className="border-t border-gray-100 dark:border-gray-700">
        {systemPromptPresets.length === 0 ? (
          <p className="px-3 py-3 text-xs text-gray-400 dark:text-gray-600">
            {t.settings_chat_presets_empty}
          </p>
        ) : (
          systemPromptPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => { onSetChatSystemPrompt(preset.content); setShowDropdown(false) }}
              className={`btn-menu-item items-start justify-start text-left ${chatSystemPrompt === preset.content ? 'btn-active' : 'text-gray-700 dark:text-gray-200'}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium truncate">{preset.name}</span>
                  {preset.isDefault && (
                    <span className="ui-badge-xs shrink-0 rounded-md px-1 text-gray-600 dark:bg-neutral-700 dark:text-gray-300">
                      {t.settings_chat_preset_is_default}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{preset.content}</p>
              </div>
              {chatSystemPrompt === preset.content && (
                <RadioCheckedIcon className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
              )}
            </button>
          ))
        )}
      </div>

      {showAddForm && (
        <div className="border-t border-gray-100 dark:border-gray-700 p-3 space-y-2">
          <p className="ui-kicker">{t.settings_chat_preset_add}</p>
          <input
            ref={nameInputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t.settings_chat_preset_name_placeholder}
            className="field-input field-input-sm"
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={t.chat_system_prompt_placeholder}
            rows={3}
            className="field-textarea field-textarea-sm"
          />
          <div className="flex items-center gap-2 justify-end">
            <Button
              size="md"
              shape="rect"
              variant="neutral"
              appearance="outline"
              type="button"
              onClick={handleCancelAdd}
            >
              {t.settings_chat_preset_cancel}
            </Button>
            <Button
              size="md"
              shape="rect"
              variant="primary"
              appearance="solid"
              type="button"
              onClick={handleSavePreset}
              disabled={!newName.trim() || !newContent.trim()}
            >
              {t.settings_chat_preset_save}
            </Button>
          </div>
        </div>
      )}

      <div className="px-3 py-2.5 flex items-center justify-between border-t border-gray-100 dark:border-gray-700">
        {!showAddForm ? (
          <Button
            size="md"
            shape="rect"
            variant="neutral"
            appearance="ghost"
            type="button"
            onClick={handleOpenAddForm}
          >
            <PlusIcon />
            {t.settings_chat_preset_add}
          </Button>
        ) : (
          <Button
            size="md"
            shape="rect"
            variant="neutral"
            appearance="ghost"
            type="button"
            onClick={handleCancelAdd}
          >
            <XIcon className="w-3 h-3" />
            {t.settings_chat_preset_cancel}
          </Button>
        )}
        <Button
          size="md"
          shape="rect"
          variant="neutral"
          appearance="ghost"
          type="button"
          onClick={() => { setShowDropdown(false); onNavigateSettings() }}
        >
          {t.settings_title}
          <ChevronRightIcon />
        </Button>
      </div>
    </div>,
    document.body
  )

  return (
    <>
      <Button
        size="md"
        shape="rect"
        variant={isActive ? 'primary' : 'neutral'}
        appearance={isActive ? 'soft' : 'outline'}
        ref={triggerRef}
        type="button"
        onClick={showDropdown ? () => { setShowDropdown(false); setShowAddForm(false) } : openDropdown}
        title={t.chat_system_prompt}
        aria-expanded={showDropdown}
        aria-haspopup="dialog"
        className={compact ? `whitespace-nowrap` : `w-full justify-start whitespace-nowrap`}
      >
        <DocumentIcon />
        <span className="max-w-[120px] truncate">
          {activePreset ? activePreset.name : t.chat_system_prompt}
        </span>
        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-gray-500 flex-shrink-0" />}
        <ChevronDownIcon className="w-2.5 h-2.5 flex-shrink-0" />
      </Button>
      {panel}
    </>
  )
}
