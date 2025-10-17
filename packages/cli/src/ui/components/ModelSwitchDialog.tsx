/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';

export enum VisionSwitchOutcome {
  SwitchOnce = 'once',
  SwitchSessionToVL = 'session',
  ContinueWithCurrentModel = 'persist',
}

export interface ModelSwitchDialogProps {
  onSelect: (outcome: VisionSwitchOutcome) => void;
}

export const ModelSwitchDialog: React.FC<ModelSwitchDialogProps> = ({
  onSelect,
}) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onSelect(VisionSwitchOutcome.ContinueWithCurrentModel);
      }
    },
    { isActive: true },
  );

  const options: Array<RadioSelectItem<VisionSwitchOutcome>> = [
    {
      label: '仅为此次请求切换',
      value: VisionSwitchOutcome.SwitchOnce,
    },
    {
      label: '将会话切换到视觉模型',
      value: VisionSwitchOutcome.SwitchSessionToVL,
    },
    {
      label: '继续使用当前模型',
      value: VisionSwitchOutcome.ContinueWithCurrentModel,
    },
  ];

  const handleSelect = (outcome: VisionSwitchOutcome) => {
    onSelect(outcome);
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Colors.AccentYellow}
      padding={1}
      width="100%"
      marginLeft={1}
    >
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>需要切换视觉模型</Text>
        <Text>
          您的消息包含图像，但当前模型不支持视觉功能。
        </Text>
        <Text>您希望如何继续？</Text>
      </Box>

      <Box marginBottom={1}>
        <RadioButtonSelect
          items={options}
          initialIndex={0}
          onSelect={handleSelect}
          isFocused
        />
      </Box>

      <Box>
        <Text color={Colors.Gray}>按 Enter 选择，按 Esc 取消</Text>
      </Box>
    </Box>
  );
};
