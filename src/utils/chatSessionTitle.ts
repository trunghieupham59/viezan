import { DEFAULT_CHAT_SESSION_TITLE } from '../store/slices/chatSlice'

/** A conversation's title, with the stored untitled default shown in the UI language. */
export function chatSessionTitle(title: string, untitledLabel: string): string {
  return title === DEFAULT_CHAT_SESSION_TITLE ? untitledLabel : title
}
