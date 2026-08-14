/**
 * 选择文件
 * @param {boolean} multiple 是否多选
 * @param {string} accept 可以选择的文件格式
 * @returns {Promise<File[]>}
 */
export async function clickUploadFile(multiple: boolean, accept = ''): Promise<FileList | null> {
  const input = document.createElement('input')
  input.style.display = 'none'
  document.body.appendChild(input)
  input.type = 'file'
  if (multiple) {
    input.multiple = true
  }
  if (accept) {
    input.accept = accept
  }
  const removeInput = () => {
    document.body.removeChild(input)
  }
  return new Promise<FileList | null>((resolve, reject) => {
    input.click()
    input.onchange = () => {
      resolve(input.files)
      removeInput()
    }
    const r = (e: Event | string) => {
      reject(e)
      removeInput()
    }
    input.onerror = r
    input.oncancel = r
    input.onabort = r
  })
}
