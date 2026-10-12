import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const url = 'http://127.0.0.1:5173'
let server

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Web Preview did not start at ${url}`)
}

async function serverAlreadyRunning() {
  try {
    return (await fetch(url)).ok
  } catch {
    return false
  }
}

function stopServer(child) {
  if (process.platform === 'win32' && child.pid) {
    // The shell wrapper does not forward signals; kill the whole tree so Vite does not linger.
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  child.kill('SIGTERM')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function browserLaunchOptions() {
  const configuredPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  const macChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const executablePath = configuredPath || (existsSync(macChromePath) ? macChromePath : undefined)
  return { headless: true, ...(executablePath ? { executablePath } : {}) }
}

try {
  if (!(await serverAlreadyRunning())) {
    // On Windows `npm` is npm.cmd, which spawn() can only run through a shell.
    server = spawn('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1'], {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    })
  }
  await waitForServer()

  const browser = await chromium.launch(browserLaunchOptions())
  try {
    // Pin the browser language: the app follows the system language and the assertions use English labels.
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.goto(url)

    assert(await page.locator('html').getAttribute('data-runtime') === 'web-preview', 'Web Preview API marker is missing')
    assert(await page.locator('#root').isVisible(), 'React root is not visible')

    // The app's default page is not part of this contract: open AI Translate explicitly.
    // A DOM click keeps keyboard modality, so the later focus() still matches :focus-visible.
    await page.getByRole('button', { name: /^AI Translate$/ }).first().evaluate(element => element.click())

    const disabledSwap = page.locator('.translate-swap-control-disabled')
    await disabledSwap.waitFor()
    await disabledSwap.focus()
    assert(
      await page.locator('.translate-swap-tooltip').evaluate(
        element => getComputedStyle(element).visibility === 'visible',
      ),
      'Disabled language swap explanation is not keyboard discoverable',
    )

    for (const width of [1440, 800]) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(180)

      const translateLayout = await page.evaluate(() => {
        const main = document.querySelector('.app-main')
        const source = document.querySelector('.translate-source-pane')
        const result = document.querySelector('.translate-result-pane')
        const swapIcon = document.querySelector('.translate-swap-button svg')
        const resultFooter = document.querySelector('.translate-result-footer')
        const headings = Array.from(document.querySelectorAll('.translate-pane-heading'))
        if (!(main instanceof HTMLElement)
          || !(source instanceof HTMLElement)
          || !(result instanceof HTMLElement)
          || !(swapIcon instanceof SVGElement)
          || !(resultFooter instanceof HTMLElement)) return null

        const mainBounds = main.getBoundingClientRect()
        const sourceBounds = source.getBoundingClientRect()
        const resultBounds = result.getBoundingClientRect()
        const footerStyle = getComputedStyle(resultFooter)

        return {
          mainWidth: mainBounds.width,
          sourceTop: sourceBounds.top,
          sourceBottom: sourceBounds.bottom,
          resultTop: resultBounds.top,
          resultLeft: resultBounds.left,
          sourceLeft: sourceBounds.left,
          swapTransform: getComputedStyle(swapIcon).transform,
          resultFooterBorderColor: footerStyle.borderTopColor,
          resultFooterBorderStyle: footerStyle.borderTopStyle,
          resultFooterBorderWidth: Number.parseFloat(footerStyle.borderTopWidth),
          headingsVisible: headings.length === 2 && headings.every((heading) => {
            const bounds = heading.getBoundingClientRect()
            return bounds.width > 0 && bounds.height > 0 && getComputedStyle(heading).visibility === 'visible'
          }),
        }
      })

      assert(translateLayout !== null, `Translation layout is incomplete at ${width}px`)
      const shouldStack = translateLayout.mainWidth <= 899
      const isStacked = translateLayout.resultTop >= translateLayout.sourceBottom - 1
      const isSideBySide = Math.abs(translateLayout.resultTop - translateLayout.sourceTop) <= 1
        && translateLayout.resultLeft > translateLayout.sourceLeft

      assert(
        shouldStack ? isStacked : isSideBySide,
        `Translation panes do not match their container mode at ${width}px`,
      )
      assert(
        shouldStack
          ? translateLayout.swapTransform !== 'none'
          : translateLayout.swapTransform === 'none',
        `Language swap icon has the wrong orientation at ${width}px`,
      )
      assert(translateLayout.headingsVisible, `Translation pane headings are hidden at ${width}px`)
      assert(
        translateLayout.resultFooterBorderStyle === 'solid'
          && translateLayout.resultFooterBorderWidth >= 1
          && translateLayout.resultFooterBorderColor !== 'rgba(0, 0, 0, 0)',
        `Empty result footer divider is missing at ${width}px`,
      )
    }

    for (const width of [1440, 800]) {
      await page.setViewportSize({ width, height: 900 })
      const configurationTrigger = page.getByRole('button', { name: 'AI configuration' })
      await configurationTrigger.click()
      const configurationDialog = page.getByRole('dialog', { name: 'AI configuration' })
      await configurationDialog.waitFor()

      const configurationBounds = await configurationDialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return {
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          left: bounds.left,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }
      })
      assert(
        configurationBounds.top >= 0
          && configurationBounds.left >= 0
          && configurationBounds.right <= configurationBounds.viewportWidth
          && configurationBounds.bottom <= configurationBounds.viewportHeight,
        `AI configuration popover is clipped at ${width}px`,
      )

      const styleSelect = configurationDialog.getByRole('button', { name: /^Style / })
      await styleSelect.click()
      const styleListbox = page.getByRole('listbox', { name: 'Style' })
      await styleListbox.waitFor()
      const selectBounds = await styleListbox.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return {
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          left: bounds.left,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }
      })
      assert(
        selectBounds.top >= 0
          && selectBounds.left >= 0
          && selectBounds.right <= selectBounds.viewportWidth
          && selectBounds.bottom <= selectBounds.viewportHeight,
        `Shared AI configuration Select is clipped at ${width}px`,
      )

      await page.keyboard.press('Escape')
      await styleListbox.waitFor({ state: 'detached' })
      assert(await configurationDialog.isVisible(), `Select Escape closed AI configuration at ${width}px`)
      assert(
        await styleSelect.evaluate(element => element === document.activeElement),
        `Select trigger does not regain focus at ${width}px`,
      )

      await page.keyboard.press('Escape')
      await configurationDialog.waitFor({ state: 'detached' })
      assert(
        await configurationTrigger.evaluate(element => element === document.activeElement),
        `AI configuration trigger does not regain focus at ${width}px`,
      )
    }

    const input = page.locator('textarea').first()
    await input.fill('Hello, how are you?')
    await page.getByText('Xin chào, bạn khỏe không?', { exact: true }).waitFor({ timeout: 5_000 })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: /AI configuration, 1 model/i }).click()
    await page.getByRole('button', { name: /Choose translation models, 1 selected/i }).click()
    const modelDialog = page.getByRole('dialog', { name: 'Translation models' })
    await modelDialog.waitFor()
    await modelDialog.getByRole('button', { name: /Qwen3 4B.*Select model/i }).click()
    await modelDialog.getByRole('button', { name: 'Apply 2 models' }).click()
    await page.getByRole('button', { name: /AI configuration, 2 models/i }).waitFor()
    await page.getByText('2 independent requests', { exact: true }).waitFor()

    for (const width of [1440, 800]) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(180)

      const comparisonLayout = await page.evaluate(() => {
        const main = document.querySelector('.app-main')
        const list = document.querySelector('.translate-comparison-list[data-result-count="2"]')
        const tabs = document.querySelector('.translate-comparison-mobile-tabs')
        const shells = Array.from(document.querySelectorAll('.translate-comparison-card-shell'))
        if (!(main instanceof HTMLElement)
          || !(list instanceof HTMLElement)
          || !(tabs instanceof HTMLElement)
          || shells.length !== 2
          || shells.some(shell => !(shell instanceof HTMLElement))) return null

        const shellBounds = shells.map(shell => shell.getBoundingClientRect())
        const visibleShellCount = shells.filter(shell => {
          const bounds = shell.getBoundingClientRect()
          return getComputedStyle(shell).display !== 'none' && bounds.width > 0 && bounds.height > 0
        }).length

        return {
          mainWidth: main.getBoundingClientRect().width,
          listDisplay: getComputedStyle(list).display,
          tabsDisplay: getComputedStyle(tabs).display,
          visibleShellCount,
          sideBySide: Math.abs(shellBounds[0].top - shellBounds[1].top) <= 1
            && shellBounds[1].left > shellBounds[0].left,
        }
      })

      assert(comparisonLayout !== null, `Two-model comparison is incomplete at ${width}px`)
      const compact = comparisonLayout.mainWidth <= 899
      assert(
        compact
          ? comparisonLayout.tabsDisplay === 'flex'
            && comparisonLayout.listDisplay === 'block'
            && comparisonLayout.visibleShellCount === 1
          : comparisonLayout.tabsDisplay === 'none'
            && comparisonLayout.listDisplay === 'grid'
            && comparisonLayout.visibleShellCount === 2
            && comparisonLayout.sideBySide,
        `Two-model results use the wrong responsive presentation at ${width}px`,
      )
    }

    for (const scenario of [
      { width: 1440, dark: false },
      { width: 800, dark: false },
      { width: 800, dark: true },
    ]) {
      await page.setViewportSize({ width: scenario.width, height: 900 })
      await page.locator('html').evaluate((element, dark) => {
        element.classList.toggle('dark', dark)
      }, scenario.dark)

      await page.getByRole('button', { name: /AI configuration, 2 models/i }).click()
      await page.getByRole('button', { name: /Choose translation models, 2 selected/i }).click()
      const picker = page.getByRole('dialog', { name: 'Translation models' })
      await picker.waitFor()

      const pickerLayout = await picker.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const search = element.querySelector('.translate-model-search-shell')
        const available = element.querySelector('.translate-model-available')
        const toolbar = element.querySelector('.translate-model-catalog-toolbar')
        const list = element.querySelector('.translate-model-available-list')
        const stickyHeading = element.querySelector('.translate-model-provider-heading')
        const chips = Array.from(element.querySelectorAll('.selected-model-chip'))
        const positions = Array.from(element.querySelectorAll('.selected-model-chip__position'))
        if (!(search instanceof HTMLElement)
          || !(available instanceof HTMLElement)
          || !(toolbar instanceof HTMLElement)
          || !(list instanceof HTMLElement)
          || !(stickyHeading instanceof HTMLElement)) return null
        const toolbarBounds = toolbar.getBoundingClientRect()
        const listBounds = list.getBoundingClientRect()
        return {
          bounds: {
            top: bounds.top,
            right: bounds.right,
            bottom: bounds.bottom,
            left: bounds.left,
          },
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          searchRatio: search.getBoundingClientRect().width / available.getBoundingClientRect().width,
          catalogOverflow: getComputedStyle(available).overflow,
          toolbarClearsList: toolbarBounds.bottom <= listBounds.top + 1,
          stickySurface: getComputedStyle(stickyHeading).backgroundColor,
          chipCount: chips.length,
          positionCount: positions.length,
          surface: getComputedStyle(element).backgroundColor,
          text: getComputedStyle(element).color,
        }
      })
      assert(pickerLayout !== null, `Translation model picker is incomplete at ${scenario.width}px`)
      assert(
        pickerLayout.bounds.top >= 0
          && pickerLayout.bounds.left >= 0
          && pickerLayout.bounds.right <= pickerLayout.viewportWidth
          && pickerLayout.bounds.bottom <= pickerLayout.viewportHeight,
        `Translation model picker is clipped at ${scenario.width}px`,
      )
      assert(pickerLayout.searchRatio >= 0.9, `Model search lacks hierarchy at ${scenario.width}px`)
      assert(
        pickerLayout.catalogOverflow === 'hidden' && pickerLayout.toolbarClearsList,
        `Search/catalog layers overlap at ${scenario.width}px`,
      )
      assert(
        pickerLayout.stickySurface !== 'rgba(0, 0, 0, 0)',
        `Sticky provider heading is translucent at ${scenario.width}px`,
      )
      assert(
        pickerLayout.chipCount === 2 && pickerLayout.positionCount === 2,
        `Selected model ordering is not visible at ${scenario.width}px`,
      )
      assert(
        pickerLayout.surface !== 'rgba(0, 0, 0, 0)' && pickerLayout.surface !== pickerLayout.text,
        `Model picker surface/text separation failed in ${scenario.dark ? 'dark' : 'light'} mode`,
      )
      assert(
        await picker.getByRole('button', { name: /Needs API key/i }).first().isDisabled(),
        `Unavailable model is not disabled at ${scenario.width}px`,
      )

      const catalogRows = picker.locator('.model-selection-row')
      const rowCount = await catalogRows.count()
      const checkpoints = [0, Math.floor(rowCount / 2), rowCount - 1]
      for (const checkpoint of checkpoints) {
        const row = catalogRows.nth(checkpoint)
        await row.evaluate((element) => {
          element.scrollIntoView({ block: 'nearest' })
          if (element instanceof HTMLButtonElement && !element.disabled) element.focus()
        })
        await page.waitForTimeout(60)
        const rowVisibility = await row.evaluate((element) => {
          const list = element.closest('.translate-model-available-list')
          const heading = element.closest('.translate-model-provider-group')
            ?.querySelector('.translate-model-provider-heading')
          if (!(list instanceof HTMLElement) || !(heading instanceof HTMLElement)) return null
          const rowBounds = element.getBoundingClientRect()
          const listBounds = list.getBoundingClientRect()
          const headingBounds = heading.getBoundingClientRect()
          return {
            rowTop: rowBounds.top,
            rowBottom: rowBounds.bottom,
            visibleTop: Math.max(listBounds.top, headingBounds.bottom),
            visibleBottom: listBounds.bottom,
          }
        })
        assert(rowVisibility !== null, `Could not inspect catalog row ${checkpoint}`)
        assert(
          rowVisibility.rowTop >= rowVisibility.visibleTop - 1
            && rowVisibility.rowBottom <= rowVisibility.visibleBottom + 1,
          `Catalog row ${checkpoint} is clipped at ${scenario.width}px`,
        )
      }

      await picker.getByRole('button', { name: 'Cancel' }).click()
      await picker.waitFor({ state: 'detached' })
    }
    await page.locator('html').evaluate(element => element.classList.remove('dark'))

    for (const width of [1440, 760]) {
      await page.setViewportSize({ width, height: 900 })

      const compact = width < 900 ? 'true' : 'false'
      const sidebar = page.locator(
        `[data-sidebar-scope="primary"][data-responsive-compact="${compact}"]`,
      )
      await sidebar.waitFor()

      if (compact === 'true') {
        await page.locator('.primary-navigation-toggle').click()
        await page.locator('.primary-navigation-panel[data-overlay-open="true"]').waitFor()
      }

      await page.locator('.sidebar-bottom-group > .sidebar-nav-btn:last-child').click()

      const backdrop = page.locator('.modal-backdrop')
      await backdrop.waitFor()
      await page.locator('.settings-shell').waitFor()

      const settingsNavigationItems = page.locator('.settings-shell > aside .btn-nav-item')
      const desktopSettingsNavigationVisible = await settingsNavigationItems.first().isVisible()
      const settingsNavigationIsLeftAligned = !desktopSettingsNavigationVisible || await settingsNavigationItems.evaluateAll((items) => {
        const rows = items.map((item) => {
          const icon = item.querySelector('svg')
          const label = item.querySelector('span')
          if (!(item instanceof HTMLElement) || !icon || !(label instanceof HTMLElement)) return null

          const itemBounds = item.getBoundingClientRect()
          return {
            justifyContent: getComputedStyle(item).justifyContent,
            iconLeft: icon.getBoundingClientRect().left,
            iconInset: icon.getBoundingClientRect().left - itemBounds.left,
            labelLeft: label.getBoundingClientRect().left,
          }
        })

        if (rows.length === 0 || rows.some(row => row === null)) return false
        const metrics = rows.filter(row => row !== null)
        const spread = values => Math.max(...values) - Math.min(...values)

        return metrics.every(row => row.justifyContent === 'flex-start' && row.iconInset <= 24)
          && spread(metrics.map(row => row.iconLeft)) <= 1
          && spread(metrics.map(row => row.labelLeft)) <= 1
      })
      assert(
        settingsNavigationIsLeftAligned,
        `Settings navigation is not left-aligned at ${width}px`,
      )

      const compactSettingsLayoutUsesFullWidth = desktopSettingsNavigationVisible || await page.evaluate(() => {
        const shell = document.querySelector('.settings-shell')
        const sidebar = shell?.querySelector(':scope > aside')
        const content = shell?.querySelector(':scope > div')
        if (!(shell instanceof HTMLElement)
          || !(sidebar instanceof HTMLElement)
          || !(content instanceof HTMLElement)) return false
        if (getComputedStyle(sidebar).display !== 'none') return true

        return content.getBoundingClientRect().width >= shell.getBoundingClientRect().width * 0.9
      })
      assert(
        compactSettingsLayoutUsesFullWidth,
        `Compact Settings content is stranded in a desktop grid column at ${width}px`,
      )

      assert(
        await page.locator('.primary-navigation-panel[data-overlay-open="true"]').count() === 0,
        `Primary navigation overlay stayed open behind Settings at ${width}px`,
      )

      const modalCoversSidebar = await page.evaluate(() => {
        const navigation = document.querySelector('[data-sidebar-scope="primary"]')
        const modal = document.querySelector('.modal-backdrop')
        if (!(navigation instanceof HTMLElement) || !(modal instanceof HTMLElement)) return false

        const bounds = navigation.getBoundingClientRect()
        const topmostElement = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
        )
        return topmostElement !== null && modal.contains(topmostElement)
      })

      assert(modalCoversSidebar, `Settings modal is below primary navigation at ${width}px`)

      await page.keyboard.press('Escape')
      await backdrop.waitFor({ state: 'detached' })
    }

    for (const width of [1440, 800]) {
      await page.setViewportSize({ width, height: 900 })
      if (width < 900) {
        const compactSidebar = page.locator(
          '[data-sidebar-scope="primary"][data-responsive-compact="true"]',
        )
        await compactSidebar.waitFor()
        await page.locator('.primary-navigation-toggle').click()
        await page.locator('.primary-navigation-panel[data-overlay-open="true"]').waitFor()
      }
      const appBodyHeightBefore = await page.locator('.app-body').evaluate(
        element => element.getBoundingClientRect().height,
      )

      await page.keyboard.press('Control+K')

      const palette = page.locator('.cmd-palette-panel')
      await palette.waitFor()
      await page.waitForTimeout(220)

      assert(
        await page.locator('.primary-navigation-panel[data-overlay-open="true"]').count() === 0,
        `Primary navigation overlay stayed open behind the command palette at ${width}px`,
      )

      assert(
        await palette.getAttribute('role') === 'dialog',
        `Command palette does not expose a dialog at ${width}px`,
      )
      assert(
        await page.locator('.cmd-palette-input').evaluate(element => element === document.activeElement),
        `Command palette search is not focused at ${width}px`,
      )

      const paletteLayout = await palette.evaluate((element) => {
        const backdrop = element.closest('.cmd-palette-backdrop')
        const firstItem = element.querySelector('.cmd-palette-item')
        const list = element.querySelector('.cmd-palette-list')
        if (!(backdrop instanceof HTMLElement)
          || !(firstItem instanceof HTMLElement)
          || !(list instanceof HTMLElement)) return null

        const viewport = { width: window.innerWidth, height: window.innerHeight }
        const backdropBounds = backdrop.getBoundingClientRect()
        const panelBounds = element.getBoundingClientRect()
        const itemBounds = firstItem.getBoundingClientRect()
        const backdropStyle = getComputedStyle(backdrop)
        const panelStyle = getComputedStyle(element)
        const itemStyle = getComputedStyle(firstItem)

        return {
          viewport,
          backdropBounds: {
            top: backdropBounds.top,
            left: backdropBounds.left,
            width: backdropBounds.width,
            height: backdropBounds.height,
          },
          panelBounds: {
            top: panelBounds.top,
            left: panelBounds.left,
            width: panelBounds.width,
            height: panelBounds.height,
          },
          itemWidth: itemBounds.width,
          backdropPosition: backdropStyle.position,
          panelDisplay: panelStyle.display,
          panelDirection: panelStyle.flexDirection,
          itemDisplay: itemStyle.display,
          listOverflowY: getComputedStyle(list).overflowY,
        }
      })

      assert(paletteLayout !== null, `Command palette layout is incomplete at ${width}px`)
      assert(
        paletteLayout.backdropPosition === 'fixed'
          && Math.abs(paletteLayout.backdropBounds.top) <= 1
          && Math.abs(paletteLayout.backdropBounds.left) <= 1
          && Math.abs(paletteLayout.backdropBounds.width - paletteLayout.viewport.width) <= 1
          && Math.abs(paletteLayout.backdropBounds.height - paletteLayout.viewport.height) <= 1,
        `Command palette backdrop does not cover the viewport at ${width}px`,
      )
      assert(
        paletteLayout.panelDisplay === 'flex'
          && paletteLayout.panelDirection === 'column'
          && paletteLayout.panelBounds.top > 40
          && paletteLayout.panelBounds.width >= 480
          && paletteLayout.panelBounds.width <= 560
          && paletteLayout.panelBounds.height >= 300
          && Math.abs(
            paletteLayout.panelBounds.left
              + paletteLayout.panelBounds.width / 2
              - paletteLayout.viewport.width / 2,
          ) <= 1,
        `Command palette panel is not a centered, bounded surface at ${width}px`,
      )
      assert(
        paletteLayout.itemDisplay.includes('flex')
          && paletteLayout.itemWidth >= paletteLayout.panelBounds.width - 32
          && paletteLayout.listOverflowY === 'auto',
        `Command palette result rows are not laid out correctly at ${width}px`,
      )
      assert(
        Math.abs(
          await page.locator('.app-body').evaluate(element => element.getBoundingClientRect().height)
            - appBodyHeightBefore,
        ) <= 1,
        `Command palette changed the application layout height at ${width}px`,
      )

      const search = page.locator('.cmd-palette-input')
      await search.fill('dictionary')
      // Every query also offers the "Ask AI" rows; only the navigation commands are filtered.
      const filteredIds = await page.locator('.cmd-palette-item').evaluateAll(
        elements => elements.map(element => element.getAttribute('data-command-id')),
      )
      const filteredCommands = filteredIds.filter(id => id !== 'ask' && id !== 'verify')
      assert(filteredCommands.length === 1, `Command filtering failed at ${width}px`)
      assert(
        filteredCommands[0] === 'dictionary' && filteredIds[0] === 'dictionary',
        `Command filtering returned the wrong result at ${width}px`,
      )

      await page.keyboard.press('Escape')
      await palette.waitFor({ state: 'detached' })
    }

    // Regression: a long translation must never push the per-result actions out of reach.
    await page.setViewportSize({ width: 1440, height: 900 })
    const longText = Array.from({ length: 60 }, (_, index) => `Sentence ${index + 1} of a deliberately long source.`).join(' ')
    await page.locator('textarea').first().fill(longText)
    await page.getByRole('button', { name: /Translate with 2 models/i }).click()
    await page.locator('.translate-comparison-card-actions').first().waitFor({ timeout: 5_000 })

    for (const width of [1440, 800]) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(180)

      const longResult = await page.evaluate(() => {
        const card = Array.from(document.querySelectorAll('.translate-comparison-card'))
          .find(element => element instanceof HTMLElement && element.offsetParent !== null)
        const body = document.querySelector('.translate-comparison-body')
        const cardBody = card?.querySelector('.translate-comparison-card-body')
        const actions = card?.querySelector('.translate-comparison-card-actions')
        if (!(card instanceof HTMLElement)
          || !(body instanceof HTMLElement)
          || !(cardBody instanceof HTMLElement)
          || !(actions instanceof HTMLElement)) return null
        const actionBounds = actions.getBoundingClientRect()
        return {
          actionsInViewport: actionBounds.top >= 0 && actionBounds.bottom <= window.innerHeight,
          cardBodyScrolls: cardBody.scrollHeight > cardBody.clientHeight,
          hasFooter: card.querySelector('footer') !== null,
        }
      })

      assert(longResult !== null, `Long-text comparison result is incomplete at ${width}px`)
      assert(!longResult.hasFooter, `Result actions moved back to a footer at ${width}px`)
      assert(longResult.cardBodyScrolls, `Long result does not scroll inside its card at ${width}px`)
      assert(
        longResult.actionsInViewport,
        `Read aloud and copy are out of reach for a long result at ${width}px`,
      )
    }

    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join('; ')}`)

    console.log('Web Preview smoke test passed: render + translation + AI configuration + modal layering + command palette')
  } finally {
    await browser.close()
  }
} finally {
  if (server) stopServer(server)
}
