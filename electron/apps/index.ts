import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow, dialog, shell } from 'electron'
import { fsBinary } from '../fileActions/native'
import type { CapabilityProvider } from '../ipc/capabilities'
import { createAppsRuntime } from './runtime'

const copy = {
  vi: { uninstall: 'Gỡ ứng dụng', reset: 'Đặt lại ứng dụng', cancel: 'Huỷ', question: 'Xử lý {count} mục của “{name}”?', detail: 'Tệp được chuyển vào Thùng rác; cài đặt được sao lưu trước khi xoá. Bạn có thể Hoàn tác trong nhật ký. Ứng dụng đang chạy chỉ được yêu cầu thoát bình thường.' },
  en: { uninstall: 'Uninstall app', reset: 'Reset app', cancel: 'Cancel', question: 'Process {count} items belonging to “{name}”?', detail: 'Files move to Trash; preferences are backed up before removal. Undo is available in the journal. Running apps are only asked to quit normally.' },
  ja: { uninstall: 'アプリをアンインストール', reset: 'アプリをリセット', cancel: 'キャンセル', question: '「{name}」の{count}項目を処理しますか？', detail: 'ファイルはゴミ箱へ移動し、設定は削除前にバックアップします。履歴から元に戻せます。実行中のアプリには通常の終了のみを要求します。' },
}
export function createDefaultAppsRuntime(getWindow: () => BrowserWindow | null) {
  return createAppsRuntime({
    home: os.homedir(), userData: app.getPath('userData'), platform: process.platform, uid: os.userInfo().uid,
    ownBundle: app.isPackaged ? path.resolve(app.getAppPath(), '../../..') : app.getAppPath(),
    binary: fsBinary(app.getAppPath(), process.resourcesPath, app.isPackaged),
    reveal: target => shell.showItemInFolder(target),
    confirm: async (plan, request) => {
      const window = getWindow()
      if (!window) return false
      const t = copy[request.locale]
      const items = plan.items.filter(i => request.itemIds.includes(i.id))
      const { response } = await dialog.showMessageBox(window, { type: 'warning',
        buttons: [t.cancel, t[request.action]], defaultId: 0, cancelId: 0, noLink: true,
        message: t.question.replace('{count}', String(items.length)).replace('{name}', plan.app.name),
        detail: `${t.detail}\n\n${items.map(i => i.path).join('\n')}` })
      return response === 1
    },
  })
}

export function appsCapabilities(): CapabilityProvider[] {
  return [
    { id: 'apps.inventory', get: () => ({ id: 'apps.inventory', supported: process.platform === 'darwin', permission: 'not-required' }) },
    { id: 'files.trash.undo', get: () => ({ id: 'files.trash.undo', supported: process.platform === 'darwin' && existsSync(fsBinary(app.getAppPath(), process.resourcesPath, app.isPackaged)), permission: 'not-required' }) },
  ]
}
