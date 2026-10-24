import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../AppShell'

describe('AppShell', () => {
  it('runs contextual navigation the full height beside a header-over-page column', () => {
    render(
      <AppShell
        primaryNavigation={null}
        featureHeader={<header>Chat controls</header>}
        contextSidebar={<aside aria-label="History" />}
      >
        <h1>Chat</h1>
      </AppShell>,
    )
    const header = screen.getByText('Chat controls')
    const history = screen.getByRole('complementary', { name: 'History' })
    const column = screen.getByRole('main').parentElement
    // The header covers only the column it controls, directly above the page.
    expect(column).toContainElement(header)
    expect(header.nextElementSibling).toBe(screen.getByRole('main'))
    expect(column).not.toContainElement(history)
    expect(history.nextElementSibling).toBe(column)
  })
  it('composes the navigation, page, and overlay slots', () => {
    render(
      <AppShell
        primaryNavigation={<nav aria-label="Test navigation" />}
        contextSidebar={<aside aria-label="Test context" />}
        overlays={<div role="dialog" aria-label="Test overlay" />}
      >
        <h1>Test page</h1>
      </AppShell>,
    )

    expect(screen.getByRole('navigation', { name: 'Test navigation' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Test context' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Test page')
    expect(screen.getByRole('dialog', { name: 'Test overlay' })).toBeInTheDocument()
  })

  it('renders the title bar strip and native material only when requested', () => {
    const { container, rerender } = render(
      <AppShell primaryNavigation={null} showTitlebar useNativeMaterial>
        <span>Page</span>
      </AppShell>,
    )

    expect(container.querySelector('.app-titlebar-drag')).toBeInTheDocument()
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-window-material', 'native')
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-titlebar', 'app')

    rerender(
      <AppShell primaryNavigation={null}>
        <span>Page</span>
      </AppShell>,
    )

    expect(container.querySelector('.app-titlebar-drag')).not.toBeInTheDocument()
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-window-material', 'opaque')
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-titlebar', 'none')
  })

  it('hosts accessible header controls even on platforms with a native title bar', () => {
    const { container } = render(
      <AppShell
        primaryNavigation={null}
        macWindowControls
        headerControls={<span>Navigation control</span>}
      >
        <span>Page</span>
      </AppShell>,
    )
    expect(screen.getByText('Navigation control').closest('.app-titlebar-drag')).toHaveAttribute('data-mac-window-controls', 'true')
    expect(screen.getByText('Navigation control').closest('[aria-hidden="true"]')).toBeNull()
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-titlebar', 'app')
  })
})
