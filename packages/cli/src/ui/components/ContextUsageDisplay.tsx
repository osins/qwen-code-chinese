/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { Colors } from '../colors.js';
import { tokenLimit } from '@qwen-code/qwen-code-core';

type ContextUsageDisplayProps = {
  promptTokenCount: number;
  model: string;
};

export const ContextUsageDisplay = ({
  promptTokenCount,
  model,
}: ContextUsageDisplayProps) => {
  const percentage = promptTokenCount / tokenLimit(model);
  const remainingPercentage = ((1 - percentage) * 100).toFixed(0);

  return (
    <Text color={Colors.Gray}>
      (剩余 {remainingPercentage}% 上下文)
    </Text>
  );
};
