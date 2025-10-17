# 如何贡献

我们非常乐意接受您对本项目的补丁和贡献。

## 开始之前

### 签署我们的贡献者许可协议

对此项目的贡献必须附带
[贡献者许可协议](https://cla.developers.google.com/about) (CLA)。
您（或您的雇主）保留对您的贡献的版权；这仅给我们使用和重新分发您的贡献的权限
作为项目的一部分。

如果您或您当前的雇主已经签署了 Google CLA（即使是为
不同的项目），您可能不需要再次签署。

访问 <https://cla.developers.google.com/> 查看您当前的协议或
签署新协议。

### 审查我们的社区准则

此项目遵循 [Google 开源社区
准则](https://opensource.google/conduct/)。

## 贡献流程

### 代码审查

所有提交，包括项目成员的提交，都需要审查。我们
使用 [GitHub 拉取请求](https://docs.github.com/articles/about-pull-requests)
为此目的。

### 拉取请求指南

为了帮助我们快速审查和合并您的 PR，请遵循这些指南。不符合这些标准的 PR 可能会被关闭。

#### 1. 链接到现有问题

所有 PR 都应该链接到我们跟踪器中的现有问题。这确保了在编写任何代码之前，每个更改都经过讨论并与项目目标保持一致。

- **对于错误修复：** PR 应该链接到错误报告问题。
- **对于功能：** PR 应该链接到已由维护者批准的功能请求或提案问题。

如果您的更改没有相应的问题，请**首先创建一个**并在开始编码之前等待反馈。

#### 2. 保持小而专注

我们更喜欢小的、原子的 PR，这些 PR 解决单个问题或添加单个、自包含的功能。

- **应该做：** 创建一个修复特定错误或添加特定功能的 PR。
- **不应该做：** 将多个不相关的更改（例如，错误修复、新功能和重构）捆绑到单个 PR 中。

大型更改应该分解为一系列较小的、逻辑的 PR，这些 PR 可以独立审查和合并。

#### 3. 使用草稿 PR 进行进行中的工作

如果您想获得对工作的早期反馈，请使用 GitHub 的**草稿拉取请求**功能。这向维护者发出信号，表明 PR 还没有准备好进行正式审查，但可以进行讨论和初步反馈。

#### 4. 确保所有检查通过

在提交您的 PR 之前，通过运行 `npm run preflight` 确保所有自动化检查都通过。此命令运行所有测试、linting 和其他样式检查。

#### 5. 更新文档

如果您的 PR 引入了面向用户的变化（例如，新命令、修改的标志或行为变化），您还必须更新 `/docs` 目录中的相关文档。

#### 6. 编写清晰的提交消息和良好的 PR 描述

您的 PR 应该有一个清晰、描述性的标题和对更改的详细描述。遵循 [约定式提交](https://www.conventionalcommits.org/) 标准来编写您的提交消息。

- **好的 PR 标题：** `feat(cli): 为 'config get' 命令添加 --json 标志`
- **不好的 PR 标题：** `做了一些更改`

在 PR 描述中，解释更改背后的"原因"并链接到相关问题（例如，`Fixes #123`）。

## Forking

如果您正在 fork 仓库，您将能够运行构建、测试和集成测试工作流。但是为了运行集成测试，您需要添加一个 [GitHub 仓库密钥](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository) 值为 `GEMINI_API_KEY` 并将其设置为您可用的有效 API 密钥。您的密钥和密钥对您的仓库是私有的；没有访问权限的人看不到您的密钥，您也无法看到与此仓库相关的任何密钥。

此外，您需要点击 `Actions` 标签并为您的仓库启用工作流，您会发现屏幕中央有一个大的蓝色按钮。

## 开发设置和工作流

本节指导贡献者如何构建、修改和理解此项目的开发设置。

### 设置开发环境

**先决条件：**

1.  **Node.js**：
    - **开发：** 请使用 Node.js `~20.19.0`。由于上游开发依赖问题，需要此特定版本。您可以使用像 [nvm](https://github.com/nvm-sh/nvm) 这样的工具来管理 Node.js 版本。
    - **生产：** 在生产环境中运行 CLI，任何版本的 Node.js `>=20` 都是可以接受的。
2.  **Git**

### 构建过程

要克隆仓库：

```bash
git clone https://github.com/google-gemini/gemini-cli.git # 或者您的 fork 的 URL
cd gemini-cli
```

要安装 `package.json` 中定义的依赖以及根依赖：

```bash
npm install
```

要构建整个项目（所有包）：

```bash
npm run build
```

此命令通常将 TypeScript 编译为 JavaScript，捆绑资源，并准备包以供执行。有关构建过程中发生的情况的更多详细信息，请参阅 `scripts/build.js` 和 `package.json` 脚本。

### 启用沙盒

[沙盒](#sandboxing) 强烈推荐使用，至少需要在您的 `~/.env` 中设置 `GEMINI_SANDBOX=true` 并确保沙盒提供程序（例如 `macOS Seatbelt`、`docker` 或 `podman`）可用。有关详细信息，请参阅 [沙盒](#sandboxing)。

要构建 `gemini` CLI 实用程序和沙盒容器，请从根目录运行 `build:all`：

```bash
npm run build:all
```

要跳过构建沙盒容器，您可以改用 `npm run build`。

### 运行

要从源代码启动 Gemini CLI（构建后），请从根目录运行以下命令：

```bash
npm start
```

如果您想在 gemini-cli 文件夹外运行源代码构建，您可以使用 `npm link path/to/gemini-cli/packages/cli`（参见：[文档](https://docs.npmjs.com/cli/v9/commands/npm-link)) 或 `alias gemini="node path/to/gemini-cli/packages/cli"` 来使用 `gemini` 运行

### 运行测试

此项目包含两种类型的测试：单元测试和集成测试。

#### 单元测试

要执行项目的单元测试套件：

```bash
npm run test
```

这将运行位于 `packages/core` 和 `packages/cli` 目录中的测试。在提交任何更改之前，请确保测试通过。为了进行更全面的检查，建议运行 `npm run preflight`。

#### 集成测试

集成测试旨在验证 Gemini CLI 的端到端功能。它们不会作为默认的 `npm run test` 命令的一部分运行。

要运行集成测试，请使用以下命令：

```bash
npm run test:e2e
```

有关集成测试框架的更详细信息，请参阅 [集成测试文档](./docs/integration-tests.md)。

### Linting and Preflight Checks

To ensure code quality and formatting consistency, run the preflight check:

```bash
npm run preflight
```

This command will run ESLint, Prettier, all tests, and other checks as defined in the project's `package.json`.

_ProTip_

after cloning create a git precommit hook file to ensure your commits are always clean.

```bash
echo "
# Run npm build and check for errors
if ! npm run preflight; then
  echo "npm build failed. Commit aborted."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### 格式化

要单独格式化此项目中的代码，请从根目录运行以下命令：

```bash
npm run format
```

此命令使用 Prettier 根据项目的样式指南格式化代码。

#### Linting

要单独 lint 此项目中的代码，请从根目录运行以下命令：

```bash
npm run lint
```

### 编码约定

- 请遵循现有代码库中使用的编码风格、模式和约定。
- 查阅 [QWEN.md](https://github.com/QwenLM/qwen-code/blob/main/QWEN.md)（通常在项目根目录中找到）获取与 AI 辅助开发相关的特定说明，包括 React、注释和 Git 使用的约定。
- **导入：** 请特别注意导入路径。项目使用 ESLint 强制执行包之间相对导入的限制。

### 项目结构

- `packages/`: 包含项目的各个子包。
  - `cli/`: 命令行界面。
  - `core/`: Gemini CLI 的核心后端逻辑。
- `docs/`: 包含所有项目文档。
- `scripts/`: 用于构建、测试和开发任务的实用脚本。

有关更详细的架构，请参阅 `docs/architecture.md`。

## 调试

### VS Code:

0.  运行 CLI 以在 VS Code 中使用 `F5` 进行交互式调试
1.  从根目录以调试模式启动 CLI：
    ```bash
    npm run debug
    ```
    此命令在 `packages/cli` 目录中运行 `node --inspect-brk dist/gemini.js`，暂停执行直到调试器附加。然后您可以在 Chrome 浏览器中打开 `chrome://inspect` 连接到调试器。
2.  在 VS Code 中，使用 "Attach" 启动配置（在 `.vscode/launch.json` 中找到）。

或者，如果您更喜欢直接启动当前打开的文件，可以在 VS Code 中使用 "Launch Program" 配置，但通常建议使用 'F5'。

要在沙盒容器内部命中断点，请运行：

```bash
DEBUG=1 gemini
```

**注意：** 如果项目 `.env` 文件中有 `DEBUG=true`，由于自动排除，它不会影响 gemini-cli。请使用 `.gemini/.env` 文件进行 gemini-cli 特定的调试设置。

### React DevTools

要调试 CLI 的基于 React 的 UI，您可以使用 React DevTools。用于 CLI 界面的库 Ink 与 React DevTools 版本 4.x 兼容。

1.  **在开发模式下启动 Gemini CLI：**

    ```bash
    DEV=true npm start
    ```

2.  **安装并运行 React DevTools 版本 4.28.5（或最新的兼容 4.x 版本）：**

    您可以全局安装：

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    或直接使用 npx 运行：

    ```bash
    npx react-devtools@4.28.5
    ```

    您运行的 CLI 应用程序应该连接到 React DevTools。
    ![](/docs/assets/connected_devtools.png)

## 沙盒

### macOS Seatbelt

在 macOS 上，`qwen` 在 `permissive-open` 配置文件下使用 Seatbelt (`sandbox-exec`)（参见 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`），该配置文件限制对项目文件夹的写入，但默认情况下允许所有其他操作和出站网络流量（"open"）。您可以通过在环境或 `.env` 文件中设置 `SEATBELT_PROFILE=restrictive-closed` 切换到 `restrictive-closed` 配置文件（参见 `packages/cli/src/utils/sandbox-macos-restrictive-closed.sb`），该配置文件默认拒绝所有操作和出站网络流量（"closed"）。可用的内置配置文件是 `{permissive,restrictive}-{open,closed,proxied}`（有关代理网络，请参见下文）。如果您还在项目设置目录 `.qwen` 下创建文件 `.qwen/sandbox-macos-<profile>.sb`，您也可以切换到自定义配置文件 `SEATBELT_PROFILE=<profile>`。

### 基于容器的沙盒（所有平台）

为了在 macOS 或其他平台上进行更强的基于容器的沙盒，您可以在环境或 `.env` 文件中设置 `GEMINI_SANDBOX=true|docker|podman|<command>`。指定的命令（或如果 `true` 则是 `docker` 或 `podman`）必须安装在主机上。启用后，`npm run build:all` 将构建一个最小容器（"sandbox"）镜像，`npm start` 将在该容器的新实例中启动。第一次构建可能需要 20-30 秒（主要是由于下载基础镜像），但之后构建和启动的开销应该最小。默认构建（`npm run build`）不会重新构建沙盒。

基于容器的沙盒以读写访问权限挂载项目目录（和系统临时目录），并在您启动/停止 Gemini CLI 时自动启动/停止/删除。在沙盒内创建的文件应自动映射到主机上的您的用户/组。您可以通过设置 `SANDBOX_{MOUNTS,PORTS,ENV}` 按需轻松指定额外的挂载、端口或环境变量。您还可以通过在项目设置目录（`.qwen`）下创建文件 `.qwen/sandbox.Dockerfile` 和/或 `.qwen/sandbox.bashrc` 并使用 `BUILD_SANDBOX=1` 运行 `qwen` 来为您的项目完全自定义沙盒，以触发构建您的自定义沙盒。

#### 代理网络

所有沙盒方法，包括使用 `*-proxied` 配置文件的 macOS Seatbelt，都支持通过自定义代理服务器限制出站网络流量，该服务器可以指定为 `GEMINI_SANDBOX_PROXY_COMMAND=<command>`，其中 `<command>` 必须启动一个在 `:::8877` 上监听相关请求的代理服务器。请参阅 `docs/examples/proxy-script.md` 了解一个仅允许到 `example.com:443` 的 `HTTPS` 连接（例如 `curl https://example.com`）并拒绝所有其他请求的最小代理。代理会随着沙盒自动启动和停止。

## 手动发布

我们为每次提交到内部注册表发布一个构件。但如果您需要手动制作本地构建，则运行以下命令：

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```
