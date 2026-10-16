import type { Translations } from '../../../i18n/types'
import type { ChatTaskStarterState } from '../../../types/chatTask'
import { getChatTaskDefinitions } from '../../../utils/chatTaskConfiguration'
import { Button } from '../atoms'
import { ImageSparkleIcon, LightbulbIcon, PencilIcon, TelescopeIcon, TranslateIcon } from '../icons'

export type { ChatTaskStarterState } from '../../../types/chatTask'

interface ChatTaskStartersProps {
  t: Translations
  state?: ChatTaskStarterState | null
  onSelect: (index: number | null, option?: string) => void
  imageSupported?: boolean
}

/** Compact shortcuts introduce tasks without competing with the composer. */
export function ChatTaskStarters({ t, state, onSelect, imageSupported = false }: ChatTaskStartersProps) {
  const icons = [TranslateIcon, TelescopeIcon, LightbulbIcon, PencilIcon, ImageSparkleIcon]
  return (
    <div className="chat-starter-actions">
      {getChatTaskDefinitions(t).map(({ title, desc }, index) => {
        const Icon = icons[index]
        return <Button key={title} size="md" shape="pill"
          variant={state?.selected === index ? 'primary' : 'neutral'}
          appearance={state?.selected === index ? 'soft' : 'outline'}
          disabled={index === 4 && !imageSupported}
          aria-label={title + desc} title={desc} aria-pressed={state?.selected === index}
          onClick={() => onSelect(index)}>
          <Icon className="h-4 w-4" />{title}
        </Button>
      })}
    </div>
  )
}
