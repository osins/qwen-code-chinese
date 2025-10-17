/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { Colors } from '../colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';

export enum QuitChoice {
  CANCEL = 'cancel',
  QUIT = 'quit',
  SAVE_AND_QUIT = 'save_and_quit',
  SUMMARY_AND_QUIT = 'summary_and_quit',
}

interface QuitConfirmationDialogProps {
  onSelect: (choice: QuitChoice) => void;
}

export const QuitConfirmationDialog: React.FC<QuitConfirmationDialogProps> = ({
  onSelect,
}) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onSelect(QuitChoice.CANCEL);
      }
    },
    { isActive: true },
  );

  const options: Array<RadioSelectItem<QuitChoice>> = [
    {
      label: '立即退出 (/quit)',
      value: QuitChoice.QUIT,
    },
    {
      label: '生成摘要并退出 (/summary)',
      value: QuitChoice.SUMMARY_AND_QUIT,
    },
    {
      label: '保存对话并退出 (/chat save)',
      value: QuitChoice.SAVE_AND_QUIT,
    },
    {
      label: '取消 (留在应用程序中)',
      value: QuitChoice.CANCEL,
    },
  ];

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
        <Text>退出前您想做什么？</Text>
      </Box>

      <RadioButtonSelect items={options} onSelect={onSelect} isFocused />
    </Box>
  );
};
