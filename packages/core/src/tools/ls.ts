/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import type { Config } from '../config/config.js';
import { DEFAULT_FILE_FILTERING_OPTIONS } from '../config/config.js';
import { ToolErrorType } from './tool-error.js';

/**
 * Parameters for the LS tool
 */
export interface LSToolParams {
  /**
   * The absolute path to the directory to list
   */
  path: string;

  /**
   * Array of glob patterns to ignore (optional)
   */
  ignore?: string[];

  /**
   * Whether to respect .gitignore and .qwenignore patterns (optional, defaults to true)
   */
  file_filtering_options?: {
    respect_git_ignore?: boolean;
    respect_gemini_ignore?: boolean;
  };
}

/**
 * File entry returned by LS tool
 */
export interface FileEntry {
  /**
   * Name of the file or directory
   */
  name: string;

  /**
   * Absolute path to the file or directory
   */
  path: string;

  /**
   * Whether this entry is a directory
   */
  isDirectory: boolean;

  /**
   * Size of the file in bytes (0 for directories)
   */
  size: number;

  /**
   * Last modified timestamp
   */
  modifiedTime: Date;
}

class LSToolInvocation extends BaseToolInvocation<LSToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    params: LSToolParams,
  ) {
    super(params);
  }

  /**
   * Checks if a filename matches any of the ignore patterns
   * @param filename Filename to check
   * @param patterns Array of glob patterns to check against
   * @returns True if the filename should be ignored
   */
  private shouldIgnore(filename: string, patterns?: string[]): boolean {
    if (!patterns || patterns.length === 0) {
      return false;
    }
    for (const pattern of patterns) {
      // Convert glob pattern to RegExp
      const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(filename)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets a description of the file reading operation
   * @returns A string describing the file being read
   */
  getDescription(): string {
    const relativePath = makeRelative(
      this.params.path,
      this.config.getTargetDir(),
    );
    return `列出目录: ${shortenPath(relativePath)}`;
  }

  // Helper for consistent error formatting
  private errorResult(
    llmContent: string,
    returnDisplay: string,
    type: ToolErrorType,
  ): ToolResult {
    return {
      llmContent,
      // Keep returnDisplay simpler in core logic
      returnDisplay: `错误: ${returnDisplay}`,
      error: {
        message: llmContent,
        type,
      },
    };
  }

  /**
   * Executes the LS operation with the given parameters
   * @returns Result of the LS operation
   */
  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const stats = fs.statSync(this.params.path);
      if (!stats) {
        // fs.statSync throws on non-existence, so this check might be redundant
        // but keeping for clarity. Error message adjusted.
        return this.errorResult(
          `错误: 目录未找到或无法访问: ${this.params.path}`,
          `目录未找到或无法访问。`,
          ToolErrorType.FILE_NOT_FOUND,
        );
      }
      if (!stats.isDirectory()) {
        return this.errorResult(
          `错误: 路径不是目录: ${this.params.path}`,
          `路径不是目录。`,
          ToolErrorType.PATH_IS_NOT_A_DIRECTORY,
        );
      }

      const files = fs.readdirSync(this.params.path);

      const defaultFileIgnores =
        this.config.getFileFilteringOptions() ?? DEFAULT_FILE_FILTERING_OPTIONS;

      const fileFilteringOptions = {
        respectGitIgnore:
          this.params.file_filtering_options?.respect_git_ignore ??
          defaultFileIgnores.respectGitIgnore,
        respectGeminiIgnore:
          this.params.file_filtering_options?.respect_gemini_ignore ??
          defaultFileIgnores.respectGeminiIgnore,
      };

      // Get centralized file discovery service

      const fileDiscovery = this.config.getFileService();

      const entries: FileEntry[] = [];
      let gitIgnoredCount = 0;
      let geminiIgnoredCount = 0;

      if (files.length === 0) {
        // Changed error message to be more neutral for LLM
        return {
          llmContent: `目录 ${this.params.path} 是空的。`,
          returnDisplay: `目录是空的。`,
        };
      }

      for (const file of files) {
        if (this.shouldIgnore(file, this.params.ignore)) {
          continue;
        }

        const fullPath = path.join(this.params.path, file);
        const relativePath = path.relative(
          this.config.getTargetDir(),
          fullPath,
        );

        // Check if this file should be ignored based on git or gemini ignore rules
        if (
          fileFilteringOptions.respectGitIgnore &&
          fileDiscovery.shouldGitIgnoreFile(relativePath)
        ) {
          gitIgnoredCount++;
          continue;
        }
        if (
          fileFilteringOptions.respectGeminiIgnore &&
          fileDiscovery.shouldGeminiIgnoreFile(relativePath)
        ) {
          geminiIgnoredCount++;
          continue;
        }

        try {
          const stats = fs.statSync(fullPath);
          const isDir = stats.isDirectory();
          entries.push({
            name: file,
            path: fullPath,
            isDirectory: isDir,
            size: isDir ? 0 : stats.size,
            modifiedTime: stats.mtime,
          });
        } catch (error) {
          // Log error internally but don't fail the whole listing
          console.error(`访问 ${fullPath} 时出错: ${error}`);
        }
      }

      // Sort entries (directories first, then alphabetically)
      entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      // Create formatted content for LLM
      const directoryContent = entries
        .map((entry) => `${entry.isDirectory ? '[目录] ' : ''}${entry.name}`)
        .join('\n');

      let resultMessage = `目录 ${this.params.path} 的内容:\n${directoryContent}`;
      const ignoredMessages = [];
      if (gitIgnoredCount > 0) {
        ignoredMessages.push(`${gitIgnoredCount} 个 git 忽略的文件`);
      }
      if (geminiIgnoredCount > 0) {
        ignoredMessages.push(`${geminiIgnoredCount} 个 gemini 忽略的文件`);
      }

      if (ignoredMessages.length > 0) {
        resultMessage += `\n\n(${ignoredMessages.join(', ')})`;
      }

      let displayMessage = `列出了 ${entries.length} 个项目。`;
      if (ignoredMessages.length > 0) {
        displayMessage += ` (${ignoredMessages.join(', ')})`;
      }

      return {
        llmContent: resultMessage,
        returnDisplay: displayMessage,
      };
    } catch (error) {
      const errorMsg = `列出目录时出错: ${error instanceof Error ? error.message : String(error)}`;
      return this.errorResult(
        errorMsg,
        '列出目录失败。',
        ToolErrorType.LS_EXECUTION_ERROR,
      );
    }
  }
}

/**
 * Implementation of the LS tool logic
 */
export class LSTool extends BaseDeclarativeTool<LSToolParams, ToolResult> {
  static readonly Name = 'list_directory';

  constructor(private config: Config) {
    super(
      LSTool.Name,
      '读取文件夹',
      '列出指定目录路径内直接包含的文件和子目录的名称。可以选择忽略匹配提供glob模式的条目。',
      Kind.Search,
      {
        properties: {
          path: {
            description:
              '要列出的目录的绝对路径（必须是绝对路径，不是相对路径）',
            type: 'string',
          },
          ignore: {
            description: '要忽略的glob模式列表',
            items: {
              type: 'string',
            },
            type: 'array',
          },
          file_filtering_options: {
            description:
              '可选：是否遵循 .gitignore 或 .qwenignore 中的忽略模式',
            type: 'object',
            properties: {
              respect_git_ignore: {
                description:
                  '可选：列出文件时是否遵循 .gitignore 模式。仅在 git 仓库中可用。默认为 true。',
                type: 'boolean',
              },
              respect_gemini_ignore: {
                description:
                  '可选：列出文件时是否遵循 .qwenignore 模式。默认为 true。',
                type: 'boolean',
              },
            },
          },
        },
        required: ['path'],
        type: 'object',
      },
    );
  }

  /**
   * Validates the parameters for the tool
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  protected override validateToolParamValues(
    params: LSToolParams,
  ): string | null {
    if (!path.isAbsolute(params.path)) {
      return `路径必须是绝对路径: ${params.path}`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(params.path)) {
      const directories = workspaceContext.getDirectories();
      return `路径必须在以下工作区目录之一中: ${directories.join(
        ', ',
      )}`;
    }
    return null;
  }

  protected createInvocation(
    params: LSToolParams,
  ): ToolInvocation<LSToolParams, ToolResult> {
    return new LSToolInvocation(this.config, params);
  }
}
