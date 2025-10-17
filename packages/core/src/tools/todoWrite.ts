/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { FunctionDeclaration } from '@google/genai';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as process from 'process';

import { QWEN_DIR } from '../utils/paths.js';
import type { Config } from '../config/config.js';

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface TodoWriteParams {
  todos: TodoItem[];
  modified_by_user?: boolean;
  modified_content?: string;
}

const todoWriteToolSchemaData: FunctionDeclaration = {
  name: 'todo_write',
  description:
    '为当前编码会话创建和管理结构化任务列表。这有助于跟踪进度，组织复杂任务，并展示完整性。',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              minLength: 1,
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed'],
            },
            id: {
              type: 'string',
            },
          },
          required: ['content', 'status', 'id'],
          additionalProperties: false,
        },
        description: '更新的待办事项列表',
      },
    },
    required: ['todos'],
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

const todoWriteToolDescription = `
使用此工具为当前编码会话创建和管理结构化任务列表。这有助于您跟踪进度，组织复杂任务，并向用户展示完整性。
它还帮助用户了解任务进度和请求的整体进度。

## 何时使用此工具
在以下情况下主动使用此工具：

1. 复杂的多步骤任务 - 当任务需要3个或更多不同的步骤或操作时
2. 非平凡和复杂的任务 - 需要仔细规划或多个操作的任务
3. 用户明确请求待办事项列表 - 当用户直接要求您使用待办事项列表时
4. 用户提供多个任务 - 当用户提供要完成的任务列表（编号或逗号分隔）时
5. 接收新指令后 - 立即将用户需求捕获为待办事项
6. 开始处理任务时 - 在开始工作前将其标记为in_progress。理想情况下，您一次应该只有一个待办事项处于in_progress状态
7. 完成任务后 - 将其标记为已完成，并添加在实施过程中发现的任何新的后续任务

## 何时不使用此工具

在以下情况下跳过使用此工具：
1. 只有一个简单直接的任务
2. 任务微不足道，跟踪它不会带来组织上的好处
3. 任务可以在少于3个简单步骤内完成
4. 任务纯粹是对话或信息性的

请注意，如果只有一个微不足道的任务要做，您不应该使用此工具。在这种情况下，直接完成任务会更好。

## 使用待办事项列表的示例

<example>
用户：我想在应用程序设置中添加暗模式切换。确保完成后运行测试和构建！
助手：我将帮助您在应用程序设置中添加暗模式切换。让我创建一个待办事项列表来跟踪此实现。
*创建包含以下项目的待办事项列表：*
1. 在设置页面中创建暗模式切换组件
2. 添加暗模式状态管理（上下文/存储）
3. 实现暗主题的CSS-in-JS样式
4. 更新现有组件以支持主题切换
5. 运行测试和构建过程，解决出现的任何故障或错误
*开始处理第一个任务*

<reasoning>
助手使用待办事项列表是因为：
1. 添加暗模式是需要UI、状态管理和样式更改的多步骤功能
2. 用户明确要求在之后运行测试和构建
3. 助手推断测试和构建需要通过将"确保测试和构建成功"作为最终任务来通过
</reasoning>
</example>

<example>
用户：帮我重命名项目中的getCwd函数为getCurrentWorkingDirectory
助手：让我首先搜索代码库以找到所有'getCwd'的出现。
*使用grep或搜索工具在代码库中定位getCwd的所有实例*
助手：我在8个不同文件中找到了15个'getCwd'实例。让我创建一个待办事项列表来跟踪这些更改。
*为每个需要更新的文件创建特定的待办事项*

<reasoning>
助手使用待办事项列表是因为：
1. 首先，助手搜索以了解任务范围
2. 在发现跨不同文件的多个出现后，确定这是一个有多步骤的复杂任务
3. 待办事项列表有助于确保每个实例都被系统地跟踪和更新
4. 此方法可防止遗漏任何出现并保持代码一致性
</reasoning>
</example>


<example>
用户：我需要为我的电子商务网站实现这些功能：用户注册、产品目录、购物车和结账流程。
助手：我将帮助实现这些功能。首先，让我们将所有功能添加到待办事项列表中。
*创建一个根据项目架构将每个功能分解为特定任务的待办事项列表*
助手：让我们从用户注册开始。这将涉及创建数据库模型、API端点和与现有身份验证系统集成的前端表单。

<reasoning>
助手使用待办事项列表是因为：
1. 用户在逗号分隔列表中提供了要实现的多个复杂功能
2. 待办事项列表有助于将这些大功能组织为可管理的任务
3. 此方法允许在整个实现过程中跟踪进度
</reasoning>
</example>

<example>
用户：你能帮我优化我的React应用程序吗？它的渲染很慢并且有性能问题。
助手：我将帮助优化您的React应用程序。首先，让我检查您的代码库以识别潜在的性能瓶颈。
*检查组件结构、渲染模式、状态管理和数据获取*
助手：分析您的代码库后，我识别出几个性能问题。让我创建一个待办事项列表来跟踪我们的优化工作。
*创建包含以下项目的待办事项列表：1）在ProductList中为昂贵计算实现记忆化，2）在Dashboard中为长列表添加虚拟化，3）优化Gallery组件中的图像加载，4）修复ShoppingCart中的状态更新循环，5）审查捆绑包大小并实现代码拆分*
让我们首先为ProductList组件中的昂贵计算实现记忆化。
</assistant>

<reasoning>
助手使用待办事项列表是因为：
1. 首先，助手检查代码库以识别特定性能问题
2. 基于此分析，识别出多个优化机会
3. 性能优化是需要多个步骤的非平凡任务
4. 待办事项列表有助于系统地跟踪不同组件中的改进
5. 此系统方法确保解决所有性能瓶颈
</reasoning>
</example>

## 何时不使用待办事项列表的示例

<example>
用户：如何在Python中打印'Hello World'？
助手：在Python中，您可以使用此简单代码打印"Hello World"：

python
print("Hello World")

执行时这将输出文本"Hello World"到控制台。</assistant>

<reasoning>
助手没有使用待办事项列表，因为这是一个可以在一个步骤内完成的单一、微不足道的任务。对于这样直接的请求，无需跟踪多个任务或步骤。
</reasoning>
</example>

<example>
用户：git status命令是做什么的？
助手：git status命令显示工作目录和暂存区的当前状态。它显示哪些更改已被暂存，哪些没有，以及哪些文件未被Git跟踪。这是在提交前了解存储库当前状态的基本命令。

<reasoning>
助手没有使用待办事项列表，因为这是一个信息请求，没有实际的编码任务要完成。用户只是在寻求解释，而不是要求助手执行多个步骤或任务。
</reasoning>
</example>

<example>
用户：你能添加一个注释到calculateTotal函数来解释它的作用吗？
助手：当然，让我添加一个注释到calculateTotal函数来解释它的作用。
* 使用Edit工具向calculateTotal函数添加注释 *

<reasoning>
助手没有使用待办事项列表，因为这是一个限制在代码中一个位置的单一、直接任务。添加注释不需要跟踪多个步骤或系统组织。
</reasoning>
</example>

<example>
用户：帮我运行npm install并告诉我发生了什么。
助手：我将为您运行npm install命令。

*执行：npm install*

命令成功完成。以下是输出：
[npm install命令的输出]

根据您的package.json文件，所有依赖项都已安装。

<reasoning>
助手没有使用待办事项列表，因为这是一个具有即时结果的单个命令执行。没有多个步骤需要跟踪或组织，使待办事项列表对于这个直接任务不必要。
</reasoning>
</example>

## 任务状态和管理

1. **任务状态**：使用这些状态来跟踪进度：
   - pending：任务尚未开始
   - in_progress：当前正在处理（一次限制一个任务）
   - completed：任务成功完成

2. **任务管理**：
   - 工作时实时更新任务状态
   - 完成后立即标记任务（不要批量完成）
   - 一次只进行一个任务
   - 在开始新任务之前完成当前任务
   - 从列表中完全删除不再相关的任务

3. **任务完成要求**：
   - 仅在完全完成任务时才将其标记为已完成
   - 如果遇到错误、阻碍或无法完成，请将任务保持为in_progress
   - 受阻时，创建一个描述需要解决内容的新任务
   - 永远不要将任务标记为已完成，如果：
     - 测试失败
     - 实现不完整
     - 遇到未解决的错误
     - 找不到必要的文件或依赖项

4. **任务分解**：
   - 创建特定、可操作的项目
   - 将复杂任务分解为更小、可管理的步骤
   - 使用清晰、描述性的任务名称

如有疑问，请使用此工具。主动进行任务管理展示了专注性并确保您完成所有要求。
`;

const TODO_SUBDIR = 'todos';

function getTodoFilePath(sessionId?: string): string {
  const homeDir =
    process.env['HOME'] || process.env['USERPROFILE'] || process.cwd();
  const todoDir = path.join(homeDir, QWEN_DIR, TODO_SUBDIR);

  // 如果提供了sessionId，则使用它，否则回退到'default'
  const filename = `${sessionId || 'default'}.json`;
  return path.join(todoDir, filename);
}

/**
 * 从文件系统读取当前待办事项
 */
async function readTodosFromFile(sessionId?: string): Promise<TodoItem[]> {
  try {
    const todoFilePath = getTodoFilePath(sessionId);
    const content = await fs.readFile(todoFilePath, 'utf-8');
    const data = JSON.parse(content);
    return Array.isArray(data.todos) ? data.todos : [];
  } catch (err) {
    const error = err as Error & { code?: string };
    if (!(error instanceof Error) || error.code !== 'ENOENT') {
      throw err;
    }
    return [];
  }
}

/**
 * 将待办事项写入文件系统
 */
async function writeTodosToFile(
  todos: TodoItem[],
  sessionId?: string,
): Promise<void> {
  const todoFilePath = getTodoFilePath(sessionId);
  const todoDir = path.dirname(todoFilePath);

  await fs.mkdir(todoDir, { recursive: true });

  const data = {
    todos,
    sessionId: sessionId || 'default',
  };

  await fs.writeFile(todoFilePath, JSON.stringify(data, null, 2), 'utf-8');
}

class TodoWriteToolInvocation extends BaseToolInvocation<
  TodoWriteParams,
  ToolResult
> {
  private operationType: 'create' | 'update';

  constructor(
    private readonly config: Config,
    params: TodoWriteParams,
    operationType: 'create' | 'update' = 'update',
  ) {
    super(params);
    this.operationType = operationType;
  }

  getDescription(): string {
    return this.operationType === 'create' ? '创建待办事项' : '更新待办事项';
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<false> {
    // 待办事项操作应该自动执行，无需用户确认
    return false;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { todos, modified_by_user, modified_content } = this.params;
    const sessionId = this.config.getSessionId();

    try {
      let finalTodos: TodoItem[];

      if (modified_by_user && modified_content !== undefined) {
        // 用户在外部编辑器中修改了内容，直接解析
        const data = JSON.parse(modified_content);
        finalTodos = Array.isArray(data.todos) ? data.todos : [];
      } else {
        // 使用正常的待办事项逻辑 - 简单地用新待办事项替换
        finalTodos = todos;
      }

      await writeTodosToFile(finalTodos, sessionId);

      // 为富UI渲染创建结构化显示对象
      const todoResultDisplay = {
        type: 'todo_list' as const,
        todos: finalTodos,
      };

      return {
        llmContent: JSON.stringify({
          success: true,
          todos: finalTodos,
        }),
        returnDisplay: todoResultDisplay,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[TodoWriteTool] 执行todo_write时出错: ${errorMessage}`,
      );
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `写入待办事项失败。详情: ${errorMessage}`,
        }),
        returnDisplay: `写入待办事项时出错: ${errorMessage}`,
      };
    }
  }
}

/**
 * 读取特定会话的待办事项的实用函数（对会话恢复有用）
 */
export async function readTodosForSession(
  sessionId?: string,
): Promise<TodoItem[]> {
  return readTodosFromFile(sessionId);
}

/**
 * 列出todos目录中所有待办事项文件的实用函数
 */
export async function listTodoSessions(): Promise<string[]> {
  try {
    const homeDir =
      process.env['HOME'] || process.env['USERPROFILE'] || process.cwd();
    const todoDir = path.join(homeDir, QWEN_DIR, TODO_SUBDIR);
    const files = await fs.readdir(todoDir);
    return files
      .filter((file: string) => file.endsWith('.json'))
      .map((file: string) => file.replace('.json', ''));
  } catch (err) {
    const error = err as Error & { code?: string };
    if (!(error instanceof Error) || error.code !== 'ENOENT') {
      throw err;
    }
    return [];
  }
}

export class TodoWriteTool extends BaseDeclarativeTool<
  TodoWriteParams,
  ToolResult
> {
  static readonly Name: string = todoWriteToolSchemaData.name!;

  constructor(private readonly config: Config) {
    super(
      TodoWriteTool.Name,
      'TodoWrite',
      todoWriteToolDescription,
      Kind.Think,
      todoWriteToolSchemaData.parametersJsonSchema as Record<string, unknown>,
    );
  }

  override validateToolParams(params: TodoWriteParams): string | null {
    // 验证待办事项数组
    if (!Array.isArray(params.todos)) {
      return '参数"todos"必须是一个数组。';
    }

    // 验证单个待办事项
    for (const todo of params.todos) {
      if (!todo.id || typeof todo.id !== 'string' || todo.id.trim() === '') {
        return '每个待办事项必须有一个非空的"id"字符串。';
      }
      if (
        !todo.content ||
        typeof todo.content !== 'string' ||
        todo.content.trim() === ''
      ) {
        return '每个待办事项必须有一个非空的"content"字符串。';
      }
      if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
        return '每个待办事项必须有一个有效的"status"（pending, in_progress, completed）。';
      }
    }

    // 检查重复ID
    const ids = params.todos.map((todo) => todo.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      return '待办事项ID在数组中必须唯一。';
    }

    return null;
  }

  protected createInvocation(params: TodoWriteParams) {
    // 通过检查待办事项文件是否存在来确定这是创建还是更新操作
    const sessionId = this.config.getSessionId();
    const todoFilePath = getTodoFilePath(sessionId);
    const operationType = fsSync.existsSync(todoFilePath) ? 'update' : 'create';

    return new TodoWriteToolInvocation(this.config, params, operationType);
  }
}
