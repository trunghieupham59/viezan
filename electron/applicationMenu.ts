import { Menu } from 'electron'

export interface ApplicationMenuEnvironment {
  isPackaged: boolean
  platform: NodeJS.Platform
}

/**
 * Packaged Windows builds use the app's own UI and must not expose Electron's
 * default Reload / Developer Tools menu to end users.
 */
export function shouldRemoveApplicationMenu(environment: ApplicationMenuEnvironment): boolean {
  return environment.isPackaged && environment.platform === 'win32'
}

export function configureApplicationMenu(environment: ApplicationMenuEnvironment): void {
  if (shouldRemoveApplicationMenu(environment)) {
    Menu.setApplicationMenu(null)
  }
}

/** app.isPackaged is authoritative; a user-controlled NODE_ENV must not unlock dev behavior. */
export function isDevelopmentRuntime(isPackaged: boolean): boolean {
  return !isPackaged
}
