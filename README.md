# Codex Glass · 实验版

给 **现有 Codex 桌面客户端主界面**增加可恢复的半透明玻璃样式。独立编写，MIT 开源；不是 OpenAI 官方产品。

**当前状态：0.1.0-alpha.1。官方客户端尚未实测。不能保证整窗透出桌面。**

本项目交付可测试的主题脚本、手动开发会话适配器、Codex 插件元数据及独立预览。安装插件元数据不会自动改变宿主外观。CSS 只能处理网页层；真正的桌面磨砂取决于宿主窗口原有的透明背景和 macOS 原生材质。独立原生预览用来验证这两层如何配合，不能作为官方客户端效果证明。

测试范围见 [验证记录](docs/VALIDATION.md)。

## 已实现

- 浅色、深色、跟随系统；背景浓度与内部模糊可调。
- 只改变背景层；不把文字、代码、光标或按钮整体降低透明度。
- 明确选择一个候选主窗口，结合 URL 与 Codex 专用结构拒绝不匹配页面；这是结构判断，不是应用身份认证。
- 不修改客户端安装包、不重签官方客户端、不安装开机服务。
- 无远端依赖、遥测、API Key、聊天内容读取或持久存储。
- 恢复只删除本扩展的样式和标记。重新加载页面也会消除效果。

## 先看预览

需要 Node.js 22 或以上；无需 `npm install`。

```sh
npm test
npm run preview
```

打开终端显示的 `http://127.0.0.1:…/demo/index.html`。这是带模拟背景的独立测试页面。

macOS 原生材质预览需要 Xcode Command Line Tools：

```sh
bash demo/build-native.sh
```

随后手动打开脚本打印的 `.app`。它只显示示例界面，**不是另一个 Codex 客户端**，也不连接 Codex。预览窗标题及界面会明确标注测试身份。

## 在官方窗口上试用（尚未验收）

这不是官方主题扩展 API。只在你明确允许、能自行控制的本机开发会话中实验。

**代理若被宿主策略禁止控制 Codex，必须停止在真实宿主上的操作；不能改用此适配器绕过。** 仍可以导出源码及测试隔离 fixture。

两种手动方式：

### 已有开发者工具

运行 `npm run export` 生成 `dist/apply.js` 和 `dist/restore.js`。自行检查文件，然后在确实属于主窗口的开发者工具中执行 `apply.js`。恢复时执行 `restore.js`。如果当前版本未提供开发者工具入口，不要假定它可用。

### 已有本机 CDP 开发会话

适配器只连接 **127.0.0.1**，不会替你开启调试端口、退出或重启客户端。CDP 能控制所连接的整个页面，应只短时用于本人机器；结束后退出该开发会话并正常重新打开客户端。

1. 由你自行启用客户端支持的本机开发调试会话。不同发行版是否允许调试未验证；不提供关闭安全保护或改安装包的自动脚本。
2. 列出可选主页面（不输出对话标题或路由）：

   ```sh
   node bin/codex-glass.mjs list --manual-session --port 9229
   ```

3. 明确选择列表中的一个 ID：

   ```sh
   node bin/codex-glass.mjs apply --manual-session --port 9229 --target YOUR_TARGET_ID --theme dark --tint .16 --blur 22
   ```

4. 查看状态或恢复：

   ```sh
   node bin/codex-glass.mjs status --manual-session --target YOUR_TARGET_ID
   node bin/codex-glass.mjs restore --manual-session --target YOUR_TARGET_ID
   ```

`applied: true` 只代表页面通过结构检查、扩展样式已生效；`desktopGlass: "unverified"` 会始终保留。必须在真实客户端背后移动一个不同颜色的窗口，观察透视与模糊，才能人工确认桌面效果。不要用桌面截图充当动态桌面透明。

如果仍然是纯色背景，说明当前原生窗口或更内层容器挡住了背景。alpha 版本不尝试进程注入、原生 API hook 或客户端补丁。

## Codex 插件打包

根 `plugin.json` 使用 Agent Plugins 布局，`skills/codex-glass/SKILL.md` 提供预览、导出、诊断及恢复流程。它是工作流入口，不会获得修改宿主窗口的额外权限。是否能在具体 Codex 版本的插件目录安装，仍需独立验收。

## 源码仓库

[wangyaohui1028/codex-glass-experimental](https://github.com/wangyaohui1028/codex-glass-experimental)

取得源码并运行隔离测试：

```sh
git clone https://github.com/wangyaohui1028/codex-glass-experimental.git
cd codex-glass-experimental
npm test
npm run preview
```

源代码与测试均无外部运行依赖。GitHub Actions 会在提交后检查 Node.js 22 和 24；执行结果以仓库的 Actions 页面为准。

不要把原始客户端程序、开发者工具会话、聊天数据、密钥或本机配置加入仓库。发布版本时使用 **Pre-release / Experimental** 标签，并保留“官方客户端未实测”说明，取得实际验收证据后再更新。

## 兼容性边界

- 目标为 macOS 桌面主页面，限定 `app://-/index.html`，并检查根 `data-codex-window-type="electron"`、`MainContentSurface` 和专用侧栏或输入框结构。DOM 更新可能导致拒绝启用；拒绝时不强行套用。
- 官方客户端静态窗口代码中可见原生 `vibrancy` 路径，但其启用受焦点、显示尺寸、设置等条件控制。静态代码不是实际开启的证据。
- 不保证全屏、失焦、系统“减少透明度”开启时的桌面材质效果。
- 浏览器预览只有应用内玻璃；原生 fixture 才具备自己创建的 macOS 材质。
- 透明底色后的实际对比度取决于背后的桌面。代码、菜单和输入区域保留更实的底色；请按自己的环境提高浓度。
- SPA 页面切换保留样式；整页刷新及客户端重启会取消样式。这是本 alpha 版本的明确行为。

## 参考

- [OpenAI 插件扩展](https://developers.openai.com/plugins/build/extensions)
- [OpenAI 插件打包](https://developers.openai.com/plugins/build/plugins)
- [Electron 窗口样式与透明限制](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles)

本项目不包含 OpenAI 客户端资源，也没有复制 Codex-Skin 的实现。
