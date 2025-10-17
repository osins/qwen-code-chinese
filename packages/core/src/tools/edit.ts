/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as Diff from 'diff';
import type {
  ToolCallConfirmationDetails,
  ToolEditConfirmationDetails,
  ToolInvocation,
  ToolLocation,
  ToolResult,
  ToolResultDisplay,
} from './tools.js';
import { BaseDeclarativeTool, Kind, ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import { DEFAULT_DIFF_OPTIONS, getDiffStat } from './diffOptions.js';
import { ReadFileTool } from './read-file.js';
import { ToolNames } from './tool-names.js';
import type {
  ModifiableDeclarativeTool,
  ModifyContext,
} from './modifiable-tool.js';
import { IDEConnectionStatus } from '../ide/ide-client.js';
import { FileOperation } from '../telemetry/metrics.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperationEvent } from '../telemetry/types.js';
import { getProgrammingLanguage } from '../telemetry/telemetry-utils.js';
import { getSpecificMimeType } from '../utils/fileUtils.js';

export function applyReplacement(
  currentContent: string | null,
  oldString: string,
  newString: string,
  isNewFile: boolean,
): string {
  if (isNewFile) {
    return newString;
  }
  if (currentContent === null) {
    // Should not happen if not a new file, but defensively return empty or newString if oldString is also empty
    return oldString === '' ? newString : '';
  }
  // If oldString is empty and it's not a new file, do not modify the content.
  if (oldString === '' && !isNewFile) {
    return currentContent;
  }
  return currentContent.replaceAll(oldString, newString);
}

/**
 * Parameters for the Edit tool
 */
export interface EditToolParams {
  /**
   * The absolute path to the file to modify
   */
  file_path: string;

  /**
   * The text to replace
   */
  old_string: string;

  /**
   * The text to replace it with
   */
  new_string: string;

  /**
   * Number of replacements expected. Defaults to 1 if not specified.
   * Use when you want to replace multiple occurrences.
   */
  expected_replacements?: number;

  /**
   * Whether the edit was modified manually by the user.
   */
  modified_by_user?: boolean;

  /**
   * Initially proposed string.
   */
  ai_proposed_string?: string;
}

interface CalculatedEdit {
  currentContent: string | null;
  newContent: string;
  occurrences: number;
  error?: { display: string; raw: string; type: ToolErrorType };
  isNewFile: boolean;
}

class EditToolInvocation implements ToolInvocation<EditToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    public params: EditToolParams,
  ) {}

  toolLocations(): ToolLocation[] {
    return [{ path: this.params.file_path }];
  }

  /**
   * Calculates the potential outcome of an edit operation.
   * @param params Parameters for the edit operation
   * @returns An object describing the potential edit outcome
   * @throws File system errors if reading the file fails unexpectedly (e.g., permissions)
   */
  private async calculateEdit(params: EditToolParams): Promise<CalculatedEdit> {
    const expectedReplacements = params.expected_replacements ?? 1;
    let currentContent: string | null = null;
    let fileExists = false;
    let isNewFile = false;
    const finalNewString = params.new_string;
    const finalOldString = params.old_string;
    let occurrences = 0;
    let error:
      | { display: string; raw: string; type: ToolErrorType }
      | undefined = undefined;

    try {
      currentContent = await this.config
        .getFileSystemService()
        .readTextFile(params.file_path);
      // Normalize line endings to LF for consistent processing.
      currentContent = currentContent.replace(/\r\n/g, '\n');
      fileExists = true;
    } catch (err: unknown) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        // Rethrow unexpected FS errors (permissions, etc.)
        throw err;
      }
      fileExists = false;
    }

    if (params.old_string === '' && !fileExists) {
      // Creating a new file
      isNewFile = true;
    } else if (!fileExists) {
      // Trying to edit a nonexistent file (and old_string is not empty)
      error = {
        display: `文件未找到。无法应用编辑。使用空的 old_string 来创建新文件。`,
        raw: `文件未找到: ${params.file_path}`,
        type: ToolErrorType.FILE_NOT_FOUND,
      };
    } else if (currentContent !== null) {
      occurrences = this.countOccurrences(currentContent, params.old_string);
      if (params.old_string === '') {
        // Error: Trying to create a file that already exists
        error = {
          display: `编辑失败。尝试创建一个已存在的文件。`,
          raw: `文件已存在，无法创建: ${params.file_path}`,
          type: ToolErrorType.ATTEMPT_TO_CREATE_EXISTING_FILE,
        };
      } else if (occurrences === 0) {
        error = {
          display: `编辑失败，找不到要替换的字符串。`,
          raw: `编辑失败，在 ${params.file_path} 中未找到 old_string 的匹配项。未进行任何编辑。old_string 中的确切文本未找到。确保您没有错误地转义内容并检查空格、缩进和上下文。使用 ${ReadFileTool.Name} 工具进行验证。`,
          type: ToolErrorType.EDIT_NO_OCCURRENCE_FOUND,
        };
      } else if (occurrences !== expectedReplacements) {
        const occurrenceTerm =
          expectedReplacements === 1 ? '个匹配项' : '个匹配项';

        error = {
          display: `编辑失败，期望 ${expectedReplacements} ${occurrenceTerm} 但找到了 ${occurrences} 个。`,
          raw: `编辑失败，期望 ${expectedReplacements} ${occurrenceTerm} 但在文件 ${params.file_path} 中找到了 ${occurrences} 个 old_string 的匹配项`,
          type: ToolErrorType.EDIT_EXPECTED_OCCURRENCE_MISMATCH,
        };
      } else if (finalOldString === finalNewString) {
        error = {
          display: `没有要应用的更改。old_string 和 new_string 相同。`,
          raw: `没有要应用的更改。文件 ${params.file_path} 中的 old_string 和 new_string 相同`,
          type: ToolErrorType.EDIT_NO_CHANGE,
        };
      }
    } else {
      // Should not happen if fileExists and no exception was thrown, but defensively:
      error = {
        display: `读取文件内容失败。`,
        raw: `读取现有文件内容失败: ${params.file_path}`,
        type: ToolErrorType.READ_CONTENT_FAILURE,
      };
    }

    const newContent = !error
      ? applyReplacement(
          currentContent,
          finalOldString,
          finalNewString,
          isNewFile,
        )
      : (currentContent ?? '');

    if (!error && fileExists && currentContent === newContent) {
      error = {
        display:
          '没有要应用的更改。新内容与当前内容相同。',
        raw: `没有要应用的更改。新内容与文件 ${params.file_path} 中的当前内容相同`,
        type: ToolErrorType.EDIT_NO_CHANGE,
      };
    }

    return {
      currentContent,
      newContent,
      occurrences,
      error,
      isNewFile,
    };
  }

  /**
   * Counts occurrences of a substring in a string
   */
  private countOccurrences(str: string, substr: string): number {
    if (substr === '') {
      return 0;
    }
    let count = 0;
    let pos = str.indexOf(substr);
    while (pos !== -1) {
      count++;
      pos = str.indexOf(substr, pos + substr.length); // Start search after the current match
    }
    return count;
  }

  /**
   * Handles the confirmation prompt for the Edit tool in the CLI.
   * It needs to calculate the diff to show the user.
   */
  async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(this.params);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`Error preparing edit: ${errorMsg}`);
      return false;
    }

    if (editData.error) {
      console.log(`Error: ${editData.error.display}`);
      return false;
    }

    const fileName = path.basename(this.params.file_path);
    const fileDiff = Diff.createPatch(
      fileName,
      editData.currentContent ?? '',
      editData.newContent,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );
    const ideClient = this.config.getIdeClient();
    const ideConfirmation =
      this.config.getIdeMode() &&
      ideClient?.getConnectionStatus().status === IDEConnectionStatus.Connected
        ? ideClient.openDiff(this.params.file_path, editData.newContent)
        : undefined;

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `确认编辑: ${shortenPath(makeRelative(this.params.file_path, this.config.getTargetDir()))}`,
      fileName,
      filePath: this.params.file_path,
      fileDiff,
      originalContent: editData.currentContent,
      newContent: editData.newContent,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }

        if (ideConfirmation) {
          const result = await ideConfirmation;
          if (result.status === 'accepted' && result.content) {
            // TODO(chrstn): See https://github.com/google-gemini/gemini-cli/pull/5618#discussion_r2255413084
            // for info on a possible race condition where the file is modified on disk while being edited.
            this.params.old_string = editData.currentContent ?? '';
            this.params.new_string = result.content;
          }
        }
      },
      ideConfirmation,
    };
    return confirmationDetails;
  }

  getDescription(): string {
    const relativePath = makeRelative(
      this.params.file_path,
      this.config.getTargetDir(),
    );
    if (this.params.old_string === '') {
      return `创建 ${shortenPath(relativePath)}`;
    }

    const oldStringSnippet =
      this.params.old_string.split('\n')[0].substring(0, 30) +
      (this.params.old_string.length > 30 ? '...' : '');
    const newStringSnippet =
      this.params.new_string.split('\n')[0].substring(0, 30) +
      (this.params.new_string.length > 30 ? '...' : '');

    if (this.params.old_string === this.params.new_string) {
      return `无文件变更 ${shortenPath(relativePath)}`;
    }
    return `${shortenPath(relativePath)}: ${oldStringSnippet} => ${newStringSnippet}`;
  }

  /**
   * Executes the edit operation with the given parameters.
   * @param params Parameters for the edit operation
   * @returns Result of the edit operation
   */
  async execute(_signal: AbortSignal): Promise<ToolResult> {
    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(this.params);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error preparing edit: ${errorMsg}`,
        returnDisplay: `Error preparing edit: ${errorMsg}`,
        error: {
          message: errorMsg,
          type: ToolErrorType.EDIT_PREPARATION_FAILURE,
        },
      };
    }

    if (editData.error) {
      return {
        llmContent: editData.error.raw,
        returnDisplay: `错误: ${editData.error.display}`,
        error: {
          message: editData.error.raw,
          type: editData.error.type,
        },
      };
    }

    try {
      this.ensureParentDirectoriesExist(this.params.file_path);
      await this.config
        .getFileSystemService()
        .writeTextFile(this.params.file_path, editData.newContent);

      let displayResult: ToolResultDisplay;
      const fileName = path.basename(this.params.file_path);
      const originallyProposedContent =
        this.params.ai_proposed_string || this.params.new_string;
      const diffStat = getDiffStat(
        fileName,
        editData.currentContent ?? '',
        originallyProposedContent,
        this.params.new_string,
      );

      if (editData.isNewFile) {
        displayResult = `已创建 ${shortenPath(makeRelative(this.params.file_path, this.config.getTargetDir()))}`;
      } else {
        // Generate diff for display, even though core logic doesn't technically need it
        // The CLI wrapper will use this part of the ToolResult
        const fileDiff = Diff.createPatch(
          fileName,
          editData.currentContent ?? '', // Should not be null here if not isNewFile
          editData.newContent,
          '当前',
          '建议',
          DEFAULT_DIFF_OPTIONS,
        );
        displayResult = {
          fileDiff,
          fileName,
          originalContent: editData.currentContent,
          newContent: editData.newContent,
          diffStat,
        };
      }

      const llmSuccessMessageParts = [
        editData.isNewFile
          ? `创建新文件: ${this.params.file_path} 并写入提供内容。`
          : `成功修改文件: ${this.params.file_path} (${editData.occurrences} 个替换)。`,
      ];
      if (this.params.modified_by_user) {
        llmSuccessMessageParts.push(
          `用户修改了 \`new_string\` 内容为: ${this.params.new_string}。`,
        );
      }

      const lines = editData.newContent.split('\n').length;
      const mimetype = getSpecificMimeType(this.params.file_path);
      const extension = path.extname(this.params.file_path);
      const programming_language = getProgrammingLanguage({
        file_path: this.params.file_path,
      });

      logFileOperation(
        this.config,
        new FileOperationEvent(
          EditTool.Name,
          editData.isNewFile ? FileOperation.CREATE : FileOperation.UPDATE,
          lines,
          mimetype,
          extension,
          diffStat,
          programming_language,
        ),
      );

      return {
        llmContent: llmSuccessMessageParts.join(' '),
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `执行编辑时出错: ${errorMsg}`,
        returnDisplay: `写入文件时出错: ${errorMsg}`,
        error: {
          message: errorMsg,
          type: ToolErrorType.FILE_WRITE_FAILURE,
        },
      };
    }
  }

  /**
   * Creates parent directories if they don't exist
   */
  private ensureParentDirectoriesExist(filePath: string): void {
    const dirName = path.dirname(filePath);
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
  }
}

/**
 * Implementation of the Edit tool logic
 */
export class EditTool
  extends BaseDeclarativeTool<EditToolParams, ToolResult>
  implements ModifiableDeclarativeTool<EditToolParams>
{
  static readonly Name = ToolNames.EDIT;
  constructor(private readonly config: Config) {
    super(
      EditTool.Name,
      '编辑',
      `替换文件中的文本。默认情况下，替换单个匹配项，但当指定 \`expected_replacements\` 时可以替换多个匹配项。此工具需要提供更改周围的大量上下文以确保精确目标定位。在尝试文本替换之前，始终使用 ${ReadFileTool.Name} 工具检查文件的当前内容。

      用户可以修改 \`new_string\` 内容。如果被修改，将在响应中说明。

对必需参数的期望：
1. \`file_path\` 必须是绝对路径；否则将抛出错误。
2. \`old_string\` 必须是要替换的确切文字文本（包括所有空格、缩进、换行符和周围代码等）。
3. \`new_string\` 必须是要替换 \`old_string\` 的确切文字文本（也包括所有空格、缩进、换行符和周围代码等）。确保生成的代码是正确且符合语言习惯的。
4. 永远不要转义 \`old_string\` 或 \`new_string\`，这会破坏确切文字文本的要求。
**重要：** 如果上述任何一项不满足，工具将失败。对 \`old_string\` 的关键要求：必须唯一标识要更改的单个实例。在目标文本之前和之后至少包含3行上下文，精确匹配空格和缩进。如果此字符串匹配多个位置，或不完全匹配，工具将失败。
**多次替换：** 将 \`expected_replacements\` 设置为要替换的匹配项数量。工具将替换所有与 \`old_string\` 完全匹配的匹配项。确保替换次数与您的期望相符。`,
      Kind.Edit,
      {
        properties: {
          file_path: {
            description:
              "要修改的文件的绝对路径。必须以 '/' 开头。",
            type: 'string',
          },
          old_string: {
            description:
              '要替换的确切文字文本，最好是未转义的。对于单次替换（默认），在目标文本之前和之后至少包含3行上下文，精确匹配空格和缩进。对于多次替换，请指定 expected_replacements 参数。如果此字符串不是确切的文字文本（即您转义了它）或不完全匹配，工具将失败。',
            type: 'string',
          },
          new_string: {
            description:
              '要替换 `old_string` 的确切文字文本，最好是未转义的。提供确切的文本。确保生成的代码是正确且符合语言习惯的。',
            type: 'string',
          },
          expected_replacements: {
            type: 'number',
            description:
              '期望的替换次数。如果未指定，默认为1。当您想要替换多个匹配项时使用。',
            minimum: 1,
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
        type: 'object',
      },
    );
  }

  /**
   * Validates the parameters for the Edit tool
   * @param params Parameters to validate
   * @returns Error message string or null if valid
   */
  protected override validateToolParamValues(
    params: EditToolParams,
  ): string | null {
    if (!params.file_path) {
      return "'file_path' 参数不能为空。";
    }

    if (!path.isAbsolute(params.file_path)) {
      return `文件路径必须是绝对路径: ${params.file_path}`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(params.file_path)) {
      const directories = workspaceContext.getDirectories();
      return `文件路径必须在以下工作区目录之一中: ${directories.join(', ')}`;
    }

    return null;
  }

  protected createInvocation(
    params: EditToolParams,
  ): ToolInvocation<EditToolParams, ToolResult> {
    return new EditToolInvocation(this.config, params);
  }

  getModifyContext(_: AbortSignal): ModifyContext<EditToolParams> {
    return {
      getFilePath: (params: EditToolParams) => params.file_path,
      getCurrentContent: async (params: EditToolParams): Promise<string> => {
        try {
          return this.config
            .getFileSystemService()
            .readTextFile(params.file_path);
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      getProposedContent: async (params: EditToolParams): Promise<string> => {
        try {
          const currentContent = await this.config
            .getFileSystemService()
            .readTextFile(params.file_path);
          return applyReplacement(
            currentContent,
            params.old_string,
            params.new_string,
            params.old_string === '' && currentContent === '',
          );
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      createUpdatedParams: (
        oldContent: string,
        modifiedProposedContent: string,
        originalParams: EditToolParams,
      ): EditToolParams => {
        const content = originalParams.new_string;
        return {
          ...originalParams,
          ai_proposed_string: content,
          old_string: oldContent,
          new_string: modifiedProposedContent,
          modified_by_user: true,
        };
      },
    };
  }
}
