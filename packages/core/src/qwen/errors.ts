/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Error thrown when input length exceeds DashScope API limits.
 */
export class InputLengthExceededError extends Error {
  constructor(public readonly maxLength: number, public readonly actualLength: number) {
    super(
      `Input length exceeds DashScope API limit. Maximum allowed: ${maxLength} tokens, ` +
      `actual length: ${actualLength} tokens. ` +
      `Please reduce your input or break it into smaller parts.`
    );
    this.name = 'InputLengthExceededError';
  }
}