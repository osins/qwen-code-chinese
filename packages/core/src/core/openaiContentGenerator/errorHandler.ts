/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentParameters } from '@google/genai';
import type { RequestContext } from './telemetryService.js';

export interface ErrorHandler {
  handle(
    error: unknown,
    context: RequestContext,
    request: GenerateContentParameters,
  ): never;
  shouldSuppressErrorLogging(
    error: unknown,
    request: GenerateContentParameters,
  ): boolean;
}

export class EnhancedErrorHandler implements ErrorHandler {
  constructor(
    private shouldSuppressLogging: (
      error: unknown,
      request: GenerateContentParameters,
    ) => boolean = () => false,
  ) {}

  handle(
    error: unknown,
    context: RequestContext,
    request: GenerateContentParameters,
  ): never {
    const isTimeoutError = this.isTimeoutError(error);
    const errorMessage = this.buildErrorMessage(error, context, isTimeoutError);

    // 允许子类在特定场景下抑制错误日志记录
    if (!this.shouldSuppressErrorLogging(error, request)) {
      const logPrefix = context.isStreaming
        ? 'OpenAI API 流式传输错误：'
        : 'OpenAI API 错误：';
      console.error(logPrefix, errorMessage);
    }

    // 提供有用的特定超时错误消息
    if (isTimeoutError) {
      throw new Error(
        `${errorMessage}\n\n${this.getTimeoutTroubleshootingTips(context)}`,
      );
    }

    throw error;
  }

  shouldSuppressErrorLogging(
    error: unknown,
    request: GenerateContentParameters,
  ): boolean {
    return this.shouldSuppressLogging(error, request);
  }

  private isTimeoutError(error: unknown): boolean {
    if (!error) return false;

    const errorMessage =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorCode = (error as any)?.code;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorType = (error as any)?.type;

    // Check for common timeout indicators
    return (
      errorMessage.includes('timeout') ||
      errorMessage.includes('timed out') ||
      errorMessage.includes('connection timeout') ||
      errorMessage.includes('request timeout') ||
      errorMessage.includes('read timeout') ||
      errorMessage.includes('etimedout') ||
      errorMessage.includes('esockettimedout') ||
      errorCode === 'ETIMEDOUT' ||
      errorCode === 'ESOCKETTIMEDOUT' ||
      errorType === 'timeout' ||
      errorMessage.includes('request timed out') ||
      errorMessage.includes('deadline exceeded')
    );
  }

  private buildErrorMessage(
    error: unknown,
    context: RequestContext,
    isTimeoutError: boolean,
  ): string {
    const durationSeconds = Math.round(context.duration / 1000);

    if (isTimeoutError) {
      const prefix = context.isStreaming
        ? '流式请求超时'
        : '请求超时';
      return `${prefix} ${durationSeconds}秒后。请尝试减少输入长度或在配置中增加超时时间。`;
    }

    return error instanceof Error ? error.message : String(error);
  }

  private getTimeoutTroubleshootingTips(context: RequestContext): string {
    const baseTitle = context.isStreaming
      ? '流式传输超时故障排除：'
      : '故障排除提示：';

    const baseTips = [
      '- 减少输入长度或复杂度',
      '- 在配置中增加超时时间：contentGenerator.timeout',
      '- 检查网络连接',
    ];

    const streamingSpecificTips = context.isStreaming
      ? [
          '- 检查流式连接的网络稳定性',
          '- 考虑对非常长的输入使用非流式模式',
        ]
      : ['- 考虑对长响应使用流式模式'];

    return `${baseTitle}\n${[...baseTips, ...streamingSpecificTips].join('\n')}`;
  }
}
