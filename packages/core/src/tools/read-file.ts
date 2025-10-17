/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { makeRelative, shortenPath } from '../utils/paths.js';
import type { ToolInvocation, ToolLocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames } from './tool-names.js';

import type { PartUnion } from '@google/genai';
import {
  processSingleFileContent,
  getSpecificMimeType,
} from '../utils/fileUtils.js';
import type { Config } from '../config/config.js';
import { FileOperation } from '../telemetry/metrics.js';
import { getProgrammingLanguage } from '../telemetry/telemetry-utils.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperationEvent } from '../telemetry/types.js';

/**
 * Parameters for the ReadFile tool
 */
export interface ReadFileToolParams {
  /**
   * The absolute path to the file to read
   */
  absolute_path: string;

  /**
   * The line number to start reading from (optional)
   */
  offset?: number;

  /**
   * The number of lines to read (optional)
   */
  limit?: number;
}

class ReadFileToolInvocation extends BaseToolInvocation<
  ReadFileToolParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: ReadFileToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const relativePath = makeRelative(
      this.params.absolute_path,
      this.config.getTargetDir(),
    );
    return `读取文件: ${shortenPath(relativePath)}`;
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.params.absolute_path, line: this.params.offset }];
  }

  async execute(): Promise<ToolResult> {
    const result = await processSingleFileContent(
      this.params.absolute_path,
      this.config.getTargetDir(),
      this.config.getFileSystemService(),
      this.params.offset,
      this.params.limit,
    );

    if (result.error) {
      return {
        llmContent: result.llmContent,
        returnDisplay: result.returnDisplay || '读取文件时出错',
        error: {
          message: result.error,
          type: result.errorType,
        },
      };
    }

    let llmContent: PartUnion;
    if (result.isTruncated) {
      const [start, end] = result.linesShown!;
      const total = result.originalLineCount!;
      const nextOffset = this.params.offset
        ? this.params.offset + end - start + 1
        : end;
      llmContent = `
重要：文件内容已被截断。
状态：显示第 ${start}-${end} 行，共 ${total} 行。
操作：要读取文件的更多内容，您可以在后续的 'read_file' 调用中使用 'offset' 和 'limit' 参数。例如，要读取文件的下一部分，请使用 offset: ${nextOffset}。

--- 文件内容（已截断）---
${result.llmContent}`;
    } else {
      llmContent = result.llmContent || '';
    }

    const lines =
      typeof result.llmContent === 'string'
        ? result.llmContent.split('\n').length
        : undefined;
    const mimetype = getSpecificMimeType(this.params.absolute_path);
    const programming_language = getProgrammingLanguage({
      absolute_path: this.params.absolute_path,
    });
    logFileOperation(
      this.config,
      new FileOperationEvent(
        ReadFileTool.Name,
        FileOperation.READ,
        lines,
        mimetype,
        path.extname(this.params.absolute_path),
        undefined,
        programming_language,
      ),
    );

    return {
      llmContent,
      returnDisplay: result.returnDisplay || '',
    };
  }
}

/**
 * Implementation of the ReadFile tool logic
 */
export class ReadFileTool extends BaseDeclarativeTool<
  ReadFileToolParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.READ_FILE;

  constructor(private config: Config) {
    super(
      ReadFileTool.Name,
      '读取文件',
      `读取并返回指定文件的内容。如果文件很大，内容将被截断。工具的响应将清楚地表明是否发生了截断，并提供如何使用 'offset' 和 'limit' 参数读取更多文件的详细信息。处理文本、图像（PNG、JPG、GIF、WEBP、SVG、BMP）和PDF文件。对于文本文件，它可以读取特定的行范围。`,
      Kind.Read,
      {
        properties: {
          absolute_path: {
            description:
              "要读取的文件的绝对路径（例如，'/home/user/project/file.txt'）。不支持相对路径。您必须提供绝对路径。",
            type: 'string',
          },
          offset: {
            description:
              "可选：对于文本文件，开始读取的基于0的行号。需要设置 'limit'。用于分页浏览大文件。",
            type: 'number',
          },
          limit: {
            description:
              "可选：对于文本文件，要读取的最大行数。与 'offset' 一起使用来分页浏览大文件。如果省略，则读取整个文件（如果可行，直到默认限制）。",
            type: 'number',
          },
        },
        required: ['absolute_path'],
        type: 'object',
      },
    );
  }

  protected override validateToolParamValues(
    params: ReadFileToolParams,
  ): string | null {
    const filePath = params.absolute_path;
    if (params.absolute_path.trim() === '') {
      return "'absolute_path' 参数不能为空。";
    }

    if (!path.isAbsolute(filePath)) {
      return `文件路径必须是绝对路径，但提供的是相对路径：${filePath}。您必须提供绝对路径。`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(filePath)) {
      const directories = workspaceContext.getDirectories();
      return `文件路径必须在以下工作区目录之一中：${directories.join(', ')}`;
    }
    if (params.offset !== undefined && params.offset < 0) {
      return '偏移量必须是非负数';
    }
    if (params.limit !== undefined && params.limit <= 0) {
      return '限制必须是正数';
    }

    const fileService = this.config.getFileService();
    if (fileService.shouldGeminiIgnoreFile(params.absolute_path)) {
      return `文件路径 '${filePath}' 被 .qwenignore 模式忽略。`;
    }

    return null;
  }

  protected createInvocation(
    params: ReadFileToolParams,
  ): ToolInvocation<ReadFileToolParams, ToolResult> {
    return new ReadFileToolInvocation(this.config, params);
  }
}
