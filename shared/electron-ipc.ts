export const ELECTRON_IPC = Object.freeze({
  openDialog: 'dialog:open',
  saveDialog: 'dialog:save',
  showItemInFolder: 'shell:show-item-in-folder',
  storageGet: 'secure-storage:get',
  storageSet: 'secure-storage:set',
  storageRemove: 'secure-storage:remove',
})

export type IpcSuccess<T> = { ok: true; value: T }
export type IpcFailure = { ok: false; error: string }
export type IpcResult<T> = IpcSuccess<T> | IpcFailure
