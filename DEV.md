# 开发指南

本文面向需要调试、维护或扩展本项目的开发者。用户操作说明见 [README.md](./README.md)。

## 环境要求

- uTools，以及可加载 `plugin.json` 的开发者工具（开发 uTools 版本时）
- Node.js `>= 20.0.0`
- npm `>= 10.0.0`

安装依赖并启动 Vite：

```bash
npm install
npm run dev:utools
```

随后在 uTools 开发者工具中加载 `dist/plugin.json`。该清单的 `development.main` 指向 `http://localhost:5173`。独立客户端使用 `npm run dev:electron` 启动。

常用命令：

| 命令 | 用途 |
| --- | --- |
| `npm run dev:utools` | 构建初始资源，并同时监听前端、preload 和类型检查 |
| `npm run dev:electron` | 启动独立 Electron 开发客户端 |
| `npm run typecheck` | 检查 Vue、uTools preload、Electron 和构建配置 |
| `npm test` | 执行协议、批量取消、宿主契约、历史、密钥和 preload bundle 测试 |
| `npm run build:utools` | 构建 uTools 产物到 `dist/utools` |
| `npm run build:electron` | 构建 Electron main、preload 和 renderer 到 `dist/electron` |
| `npm run dist:electron` | 构建 Windows NSIS 安装包到 `release` |
| `npm run check` | 执行完整类型检查、测试和双端构建 |

完整功能必须运行在 uTools 或 Electron 客户端中。普通浏览器不存在 `window.services`，只能用于有限的界面检查。

## 技术结构

```text
src/
├─ App.vue                              应用框架、侧边栏导航和设置抽屉入口
├─ main.ts                              注册 Vue Router 与 Pinia
├─ router/index.ts                      Hash 路由
├─ stores/encryptionSettings.ts         当前会话的全局加密设置
├─ components/
│  ├─ EncryptionSettingsDialog.vue      左侧设置抽屉、文件/文本配置与数据重置
│  ├─ FileSelector.vue                  文件选择展示
│  ├─ KeyInput.vue                      PEM 密钥上传与粘贴
│  └─ HashValueCell.vue                 哈希展示与复制
└─ views/
   ├─ FileEncryption.vue                文件加解密与密码快速填充
   ├─ FileBatchEncryption.vue           串行批量加解密、失败重试与取消
   ├─ FilePasswordChange.vue            原位重新包装密码加密包的 DEK
   ├─ TextEncryption.vue                文本加解密、TXT 导入导出
   ├─ FileHash.vue                      多文件哈希计算
   ├─ KeyManagement.vue                 X25519 身份和联系人公钥管理
   ├─ EncryptionHistory.vue             加密历史管理
   └─ Introduction.vue                  插件内使用说明

shared/preload-api.ts                   前端与 preload 共用的服务契约

preload/
├─ index.ts                             esbuild 唯一入口并挂载 window.services
├─ config.ts                            协议常量与算法编号的唯一来源
├─ internal-types.ts                    协议与加密上下文内部类型
├─ utils/                               协议、密码学、压缩与文件流实现
└─ services/                            路径、校验、存储与业务工作流

public/
└─ plugin.json                          uTools 插件清单源文件

dist/                                   开发调试与生产发布的统一插件目录
├─ plugin.json                          uTools 开发时加载此清单
├─ index.html                           Vite 构建的前端入口
└─ preload/
   ├─ package.json
   └─ index.js                          esbuild 直接生成的 preload bundle

scripts/build-preload.mjs               preload 构建与监听脚本
tsconfig.app.json                       Vue 前端严格类型检查
tsconfig.preload.json                   preload 严格类型检查
tsconfig.node.json                      Vite 配置类型检查
```

前端和 preload 源码均使用 TypeScript ESM。uTools 版本由 esbuild 将 `preload/index.ts` 打包成 CommonJS，正式产物输出到 `dist/utools`；Electron 版本由 electron-vite 分别构建 main、preload 和 renderer 到 `dist/electron`。`npm run dev:utools` 启动 uTools 开发链路，`npm run dev:electron` 启动独立客户端。类型错误由 `vue-tsc` 与 `tsc --noEmit` 检查。

## 页面与路由

路由使用 `createWebHashHistory()`，适合 uTools 加载本地 HTML：

| 路径 | 路由名 | 页面 |
| --- | --- | --- |
| `#/file` | `file-single` | 单文件加解密 |
| `#/file/batch` | `file-batch` | 批量文件加解密 |
| `#/password-change` | `password-change` | 修改加密包密码 |
| `#/text` | `text` | 文本加解密 |
| `#/hash` | `hash` | 文件校验 |
| `#/history` | `history` | 加密历史 |
| `#/keys` | `keys` | 非对称密钥管理 |
| `#/introduction` | `introduction` | 插件使用说明 |

根路径会重定向到 `#/file`。新增页面时同时更新 `src/router/index.ts` 和 `src/App.vue` 的导航项。

## 分层约定

调用方向如下：

```text
Vue 页面 / 组件
        │
        ├─ Pinia：共享界面配置
        │
        └─ window.services：受控的高权限 API
                    │
                    ├─ services/：按校验、路径、工作流和系统能力拆分的服务层
                    ├─ utils/：按协议、密码学、压缩和入口拆分的底层实现
                    └─ config.ts：协议常量、算法编号、scrypt 档位
```

保持以下边界：

- Vue 代码不直接引入 `node:fs`、`node:crypto` 等 Node 模块。
- 新的文件系统或 uTools 能力先按职责封装到 `services/`，再由 `preload/index.ts` 通过 `window.services` 暴露最小接口。
- 密码学和二进制协议代码按职责放在 `utils/`，不要放进组件。
- 算法编号与协议尺寸统一维护在 `config.ts`，`services/` 和 `utils/` 不重复定义。
- 前端与 preload 的公共参数必须在 `shared/preload-api.ts` 中维护，避免接口签名漂移。

## 全局配置

`src/stores/encryptionSettings.ts` 使用 Pinia 保存以下运行时配置：

| 字段 | 默认值 | 含义 |
| --- | ---: | --- |
| `fileCompressionType` | `0` | 文件加密使用 Gzip |
| `fileScryptProfile` | `0` | 文件加密使用标准档 |
| `textCompressionType` | `2` | 文本加密默认不压缩 |
| `textScryptProfile` | `0` | 文本加密使用标准档 |
| `fileExtension` | `enc` | 文件加密输出后缀 |
| `historyEnabled` | `false` | 记录文件加密历史 |

这些设置当前没有持久化插件，刷新后恢复默认值。密码快速填充方式单独保存在 `localStorage`，键名为 `file-encryption:password-fill-method`。

## Preload API

`preload/index.ts` 在 uTools preload 环境中挂载 `window.services`。接口由 `shared/preload-api.ts` 的 `PreloadServices` 统一约束；前端仍应检查该对象是否存在，并向用户提示需要在 uTools 中运行。

| API | 类型 | 用途 |
| --- | --- | --- |
| `generateRandomPassword()` | 同步 | 生成包含 24 字节随机熵的 Base64URL 密码 |
| `selectSourceFile(mode)` | 同步 | 选择单个加密或解密输入文件 |
| `selectSourceFiles(mode)` | 同步 | 选择多个加密或解密输入文件 |
| `selectOutputFile(sourcePath, mode, fileExtension, originalExtension)` | 同步 | 使用加密文件后缀和配置区中的原始后缀打开输出文件保存对话框 |
| `selectOutputDirectory(defaultPath)` | 同步 | 选择批量任务的统一输出目录 |
| `getDefaultOutputPath(sourcePath, mode, fileExtension, originalExtension)` | 同步 | 使用加密文件后缀和原始后缀生成不覆盖现有文件的默认路径 |
| `getBatchOutputPaths(sourcePaths, mode, outputDirectory, fileExtension, originalExtensions)` | 同步 | 一次性规划可恢复原始后缀、无覆盖且无内部冲突的批量输出路径 |
| `getFileInfo(filePath)` | 同步 | 返回绝对路径、文件名和字节数 |
| `encryptFile(options)` | 异步 | 流式压缩并加密文件，支持进度回调与 `AbortSignal` |
| `decryptFile(options)` | 异步 | 流式认证、解密并解压文件，支持进度回调与 `AbortSignal` |
| `inspectEncryptedFile(filePath)` | 同步 | 通过 FENC 魔数和协议头校验加密包 |
| `changeFilePassword(options)` | 同步 | 验证旧密码并原位重新包装 DEK |
| `encryptText(options)` | 同步 | 加密 UTF-8 文本并返回 Base64 |
| `decryptText(options)` | 同步 | 解密 Base64 并返回 UTF-8 文本 |
| `selectTextFile()` | 同步 | 选择并读取 UTF-8 TXT，自动移除 BOM |
| `selectKeyFile(keyType)` | 同步 | 选择并读取不超过 64 KB 的 PEM 密钥 |
| `inspectPublicKey(publicKeyPem)` | 同步 | 校验 X25519 SPKI PEM 并返回 SHA-256 指纹 |
| `listManagedKeys()` | 同步 | 返回不包含私钥正文的密钥摘要 |
| `generateManagedKey(options)` | 同步 | 生成并加密保存 X25519 身份密钥 |
| `importManagedPrivateKey(options)` | 同步 | 导入并重新加密保存 PKCS#8 私钥 |
| `importManagedPublicKey(options)` | 同步 | 保存联系人 SPKI 公钥 |
| `getManagedPublicKey(id)` | 同步 | 读取已保存公钥正文 |
| `exportManagedKey(options)` | 同步 | 导出公钥或加密私钥 PEM |
| `deleteManagedKey(id)` | 同步 | 删除指定身份或联系人记录 |
| `clearManagedKeys()` | 同步 | 清空整个 X25519 密钥库 |
| `saveTextResult(options)` | 同步 | 将结果以 UTF-8 保存为 TXT |
| `selectHashFiles()` | 同步 | 多选待校验文件 |
| `calculateFileHashes(paths)` | 异步 | 单次读取每个文件并计算三种哈希 |
| `getEncryptionHistory()` | 同步 | 读取并按时间倒序返回历史 |
| `addEncryptionHistory(options)` | 同步 | 新增加密历史 |
| `deleteEncryptionHistory(id)` | 同步 | 删除单条历史 |
| `clearEncryptionHistory()` | 同步 | 清空历史 |
| `showItemInFolder(filePath)` | 同步 | 在系统文件管理器中定位文件 |

文件加密选项：

```js
const abortController = new AbortController()

await window.services.encryptFile({
  sourcePath,
  outputPath,
  password,
  compressionType: 0,
  encryptionType: 0,
  scryptProfile: 0,
  signal: abortController.signal,
  onProgress(percentage) {
    // 0..100；数据流完成前最高为 99
  },
})
```

其中 `abortController` 为调用方持有的 `AbortController`。公钥方式将 `encryptionType` 设为 `1`，并以 `publicKeyPem` 代替 `password`。解密端根据文件头自动选择凭据，公钥包传入 `privateKeyPem` 和可选的 `privateKeyPassphrase`。

解密不接收算法选项，所有参数都从密文头读取。服务层会阻止输出覆盖输入；失败时会尽力删除不完整输出。

## 密文协议

文件和文本共用同一个二进制协议。文本仅在最终结果外增加 Base64 编码。

```text
┌───────────┬───────────────────────────┬─────────────────────────────┐
│Magic (4 B)│ Config (length in Config) │ Chunk Record 0, 1, ...      │
└───────────┴───────────────────────────┴─────────────────────────────┘
```

魔数固定为 ASCII `FENC`，对应十六进制 `46 45 4e 43`。配置区的前 4 字节包含协议版本和配置区自身长度；读取端先读取 8 字节文件前缀，再按声明长度读取剩余头部。v1 公共配置布局如下，偏移均相对于配置区起点，不包含 4 字节魔数：

| 配置偏移 | 长度 | 内容 |
| ---: | ---: | --- |
| `0..1` | 2 | 协议版本，UInt16BE；当前为 `0x0001` |
| `2..3` | 2 | 完整配置区长度，UInt16BE，包含本字段 |
| `4` | 1 | 压缩方式编号 |
| `5` | 1 | 密钥保护方式：0=密码，1=X25519 公钥 |
| `6..9` | 4 | 分块大小，UInt32BE；当前写入 1 MiB |
| `10..17` | 8 | 随机 payload nonce 前缀 |
| `18..29` | 12 | 随机 DEK wrap IV |
| `30..61` | 32 | wrapped DEK |
| `62..77` | 16 | DEK wrap AuthTag |
| `78..` | 不定 | 与密钥保护方式对应的凭据元数据，随后为原文件后缀元数据 |

密码配置区总长为 `105 + N` 字节，其中 `N` 是原文件后缀的 UTF-8 字节数：

| 配置偏移 | 长度 | 内容 |
| ---: | ---: | --- |
| `78` | 1 | scrypt 档位编号 |
| `79..102` | 24 | 随机 scrypt salt |
| `103..104` | 2 | 原文件后缀 UTF-8 字节数，UInt16BE |
| `105..` | `N` | 原文件后缀，包含起始点号；无后缀时 `N=0` |

X25519 配置区总长为 `188 + N` 字节：

| 配置偏移 | 长度 | 内容 |
| ---: | ---: | --- |
| `78..109` | 32 | 接收方公钥 SHA-256 指纹 |
| `110..153` | 44 | 临时 X25519 SPKI DER 公钥 |
| `154..185` | 32 | 随机 HKDF salt |
| `186..187` | 2 | 原文件后缀 UTF-8 字节数，UInt16BE |
| `188..` | `N` | 原文件后缀，包含起始点号；无后缀时 `N=0` |

密码配置不包含任何 X25519 字段，公钥配置也不包含 scrypt 档位或 salt。原文件后缀最多 1024 字节。无后缀且包含魔数时，密码头最小为 109 字节，公钥头最小为 192 字节；再加一个 5 字节空最终块头和 16 字节认证标签后，最小密文分别为 130 字节和 213 字节。

密钥层次：

```text
密码 + salt + scrypt 档位
        │
        └─ scrypt ──> 32 字节 KEK
                         │
随机 32 字节 DEK ───────┴─ AES-256-GCM 包装 ──> wrapped DEK + wrap tag
        │
        └─ HKDF-SHA-256 ──> 32 字节 AES-256 payload key
```

公钥方式的 KEK 层次：

```text
临时 X25519 私钥 + 接收方 X25519 公钥
        │
        └─ ECDH ──> 共享秘密 ── HKDF-SHA-256 ──> 32 字节 KEK
                                                        │
随机 32 字节 DEK ───────────────────── AES-256-GCM 包装 ┘
```

KEK 固定使用 AES-256-GCM 包装 DEK，payload 同样固定使用 AES-256-GCM。`encryptionType` 表示 DEK 的保护方式。密码方式允许只重新包装 DEK；公钥方式在每次加密时生成独立临时密钥。

每个分块记录布局：

| 相对偏移 | 长度 | 内容 |
| ---: | ---: | --- |
| `0..3` | 4 | 本块密文长度，UInt32BE |
| `4` | 1 | 标志位；bit 0 为最终块，其余位必须为 0 |
| `5..` | 不定 | 本块密文，非最终块当前固定为 1 MiB |
| 末尾 | 16 | 本块 AES-GCM AuthTag |

每块 nonce 为“8 字节文件级随机前缀 + 4 字节 UInt32BE 块序号”。块 AAD 包含魔数、版本、配置区长度、压缩/加密方式、分块大小、nonce 前缀、原文件后缀，以及公钥方式的接收方元数据、块序号、块长度和最终块标志，因此交换块、删除最终块、篡改原文件后缀或在最终块后追加数据都会失败。密码方式的 scrypt 档位和 salt 不进入块 AAD，使修改密码时可以只更新密码元数据和 DEK 包装；这些字段、公钥元数据和原文件后缀也由 wrap AuthTag 保护。最多支持 `2^32` 个块。

处理顺序为：

```text
明文 -> 可选压缩 -> 1 MiB 分块 -> 逐块 AES-GCM -> 写入连续记录
记录 -> 逐块认证解密 -> 按配置解压 -> 明文
```

解密端先校验魔数和版本，再按 `encryptionType` 使用密码或接收方私钥解包 DEK。DEK 包装认证通过后才开始处理 payload。配置区和 payload 的完整性分别由 wrap AuthTag 与各块 AuthTag 保证。

## 算法编号

压缩方式：

| 编号 | 算法 |
| ---: | --- |
| `0` | Gzip |
| `1` | Brotli |
| `2` | 不压缩 |

密钥保护方式：

| 编号 | 算法 |
| ---: | --- |
| `0` | scrypt + AES-256-GCM 包装 DEK |
| `1` | X25519 + HKDF-SHA-256 + AES-256-GCM 包装 DEK |

scrypt 档位：

| 编号 | 名称 | `logN` | `N` | `r` | `p` | `dkLen` |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| `0` | standard | 14 | 16384 | 8 | 1 | 32 |
| `1` | performance | 13 | 8192 | 8 | 1 | 32 |
| `2` | secure | 16 | 65536 | 8 | 1 | 32 |

密码方式使用 `N = 2 ** logN` 派生 KEK。公钥方式使用每文件临时 X25519 密钥和随机 32 字节 HKDF salt。两种方式的 KEK、DEK 和 payload key 均为 32 字节。

## 数据存储

加密历史的键为 `file-encryption:encryption-history`，存放在 uTools `dbCryptoStorage`。每条记录包含：

```js
{
  id,
  filePath,
  outputPath,
  encryptionType, // 0 | 1
  password, // encryptionType=0
  recipientFingerprint, // encryptionType=1
  createdAt,
  action, // encrypt | password-change
}
```

密码记录保存可恢复密码；公钥记录只保存接收方指纹，不保存私钥或私钥保护密码。不得降级到普通 `localStorage`。

X25519 密钥库使用键 `file-encryption:x25519-keyring:v1` 保存到 `dbCryptoStorage`。身份记录包含 SPKI 公钥和再次使用用户密码加密的 PKCS#8 私钥；前端列表只能读取摘要和公钥，已保存私钥仅在 preload 解密流程内部按 ID 解析。联系人记录只包含公钥。

设置抽屉中的“重置”会清除加密历史、X25519 密钥库、整个 `localStorage`、整个 `sessionStorage` 和 Pinia 当前状态，然后刷新页面。

## 哈希与文件处理

- 文件加解密通过 Node.js Stream 管线和 1 MiB 分块完成，不会把整个文件载入内存；`encryptFile` 和 `decryptFile` 可通过 `AbortSignal` 中止当前管线。
- 进度按输入流已读取字节计算，管线完成前最多报告 99%，认证和写入全部完成后报告 100%。
- 批量加解密按文件串行执行并按输入字节数聚合整体进度；单项失败继续，取消时删除当前半成品并跳过剩余项目。
- 多文件哈希按文件顺序处理；每个文件只读取一次，同时更新 MD5、SHA-1 和 SHA-256。
- 单个哈希任务失败会返回带 `error` 的结果项，不中断其余文件。
- 文本加解密是同步的内存 Buffer 操作，不适合直接承载超大文本。

## 本地测试

测试源码位于 `tests/*.test.ts` 并进入 Git，`tests/result` 和早期本地样本由 `.gitignore` 忽略。可单独运行主要测试：

```bash
npx tsx tests/scrypt.test.ts
npx tsx tests/batch.test.ts
npx tsx tests/history.test.ts
npx tsx tests/keys.test.ts
```

`scrypt.test.ts` 覆盖密码与 X25519 文件往返、三档 scrypt、错误凭据、篡改、截断和密码换密；`batch.test.ts` 覆盖取消及批量输出路径；`history.test.ts` 覆盖历史增删清空；`keys.test.ts` 覆盖密钥生成、导入、导出和已保存私钥解密；`preload-bundle.test.ts` 验证实际 CommonJS 产物能够挂载核心服务。

`tests/test.js` 是早期协议的测试示例，保留用于参考，不应作为当前协议的回归验证依据。

提交修改前至少执行：

```bash
npm test
npm run build
```

## 常见扩展点

### 增加压缩或加密算法

1. 在 `preload/config.ts` 增加稳定且不复用的编号及字面量类型。
2. 在 `preload/utils/compression.ts` 或 `crypto.ts` 增加底层实现，并在 `buffer.ts` 与 `file.ts` 接入。
3. 更新 `src/components/EncryptionSettingsDialog.vue` 的选项值。
4. 补充协议测试，并验证文件和文本往返、错误密码及篡改场景。
5. 更新 README 和本文中的格式说明。

### 扩展配置区

当前项目仍处于协议开发阶段，本次直接重置了 v1 布局，不兼容此前开发密文。协议稳定后不得再修改 v1 字段含义或长度；后续扩展应分配新版本并保留旧版解析器。

### 增加新的前端页面

页面放入 `src/views`，可复用部分放入 `src/components`，全局状态放入 Pinia store。系统能力必须通过 preload 服务调用；不要把绝对路径、密码或文件内容放入 URL。

## 发布前检查

- 更新 `package.json` 的版本号和说明。
- 完善 `public/plugin.json` 的插件标识、功能命令、说明与图标；当前清单仍需按实际发布信息核对。
- 在 uTools 中验证所有系统对话框、加密存储和文件定位功能。
- 对每组压缩、加密和 scrypt 档位执行文件与文本往返测试。
- 验证错误密码、损坏头部、篡改密文、空文件、同名输出和大文件场景。
- 执行 `npm run check`，确认类型、测试和正式构建全部通过。
- 确认 `dist/preload` 只包含 `index.js` 与 `package.json`，且 `dist/plugin.json` 指向 `preload/index.js`。
- 不要提交 `tests/result`、真实密码、真实敏感文件或其他本地缓存。

## 许可证与联系

项目采用 MIT License。作者：lijinbo，联系邮箱：lijinbode@foxmail.com。
