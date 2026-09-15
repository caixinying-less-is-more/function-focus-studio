# Function Focus

为阅读长函数设计的 Cursor / VS Code 主题，提供 Light 和 Dark 两个版本。

| 代码元素 | 视觉优先级 |
| --- | --- |
| 函数定义 | 蓝色，加粗，定位函数边界 |
| 函数和方法调用 | 蓝色加粗，扫描执行步骤；可在配色工作台关闭加粗 |
| return、if、for、try 等控制流程 | 红色系，定位输出、分支、循环与异常 |
| 参数 | 更鲜明的金色系，辅助追踪输入；深色版使用亮金色 |
| 类与类型 | 紫色系，区分对象和类型 |
| 普通变量 | 中性前景色 |
| 字符串和 docstring | 低饱和灰绿色，避免长提示词抢占注意力 |
| 注释 | 中性灰色，保持可读，不使用斜体 |

浅色主题以浅灰白为底，深色主题以炭灰为底。字符串、注释和普通代码均保持至少 4.5:1 的编辑器背景对比度。

主题包含 TextMate 语法规则和语义规则；Python 语义分类由 Cursor Pyright 等语言服务提供。语法规则覆盖常见函数调用，即使导入无法解析仍可获得基础高亮。

主题按语法角色着色，无法判断哪个调用在业务上最重要，也不会把叫作 res 的变量在各阶段自动改成不同颜色。

## 使用与修改

在 Cursor 的 Color Theme 菜单选择 Function Focus Light 或 Function Focus Dark。

本地源码位于 `~/.cursor/local-themes/function-focus/`。修改 `build.cjs` 顶部的 palettes 可调整颜色；修改 tokenColors / semanticTokenColors 可调整着色规则。运行 `node build.cjs` 后生成两份主题 JSON，再重新打包安装。

主题是纯 JSON 配置，无扩展运行代码、网络访问或模型调用。切回原来的 Visual Studio Light 主题即可恢复原主题外观。

## 本地配色工作台

在 `~/.cursor/local-themes/function-focus/` 运行 `npm start`，打开终端打印的本机地址。默认端口为 4317，被占用时会自动尝试其他端口。

工作台支持拖动色盘、色相/饱和度/明度滑块、HEX 输入、浅色与深色切换、函数调用和参数加粗、撤销与重做、恢复默认、预览字号与换行，以及主题 JSON 导出。预览代码使用 Cursor 自带的 Python TextMate 语法，实际编辑器还会叠加语言服务的语义分类。

拖动选色只更新本地预览，点击“应用到 Cursor”后才写入当前主题专属的配色设置。应用前的设置快照保存在源码目录的 `backups/` 下，其他主题的定制和无关设置保留。浏览器中的未应用草稿保存在 localStorage，成功应用的配色保存在 `studio-state.json`。

工作台仅监听本机，不发送源码或配色到外部服务。`node verify.cjs` 和 `npm test` 用于检查主题与配置写入逻辑。
