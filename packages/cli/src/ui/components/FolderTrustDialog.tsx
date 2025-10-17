/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { Colors } from '../colors.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import * as process from 'node:process';

export enum FolderTrustChoice {
  TRUST_FOLDER = 'trust_folder',
  TRUST_PARENT = 'trust_parent',
  DO_NOT_TRUST = 'do_not_trust',
}

interface FolderTrustDialogProps {
  onSelect: (choice: FolderTrustChoice) => void;
  isRestarting?: boolean;
}

export const FolderTrustDialog: React.FC<FolderTrustDialogProps> = ({
  onSelect,
  isRestarting,
}) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onSelect(FolderTrustChoice.DO_NOT_TRUST);
      }
    },
    { isActive: !isRestarting },
  );

  useKeypress(
    (key) => {
      if (key.name === 'r') {
        process.exit(0);
      }
    },
    { isActive: !!isRestarting },
  );

  const options: Array<RadioSelectItem<FolderTrustChoice>> = [
    {
      label: '信任文件夹',
      value: FolderTrustChoice.TRUST_FOLDER,
    },
    {
      label: '信任父文件夹',
      value: FolderTrustChoice.TRUST_PARENT,
    },
    {
      label: "不信任 (esc)",
      value: FolderTrustChoice.DO_NOT_TRUST,
    },
  ];

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={Colors.AccentYellow}
        padding={1}
        width="100%"
        marginLeft={1}
      >
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>您信任这个文件夹吗？</Text>
          <Text>
            信任文件夹允许Qwen Code执行它建议的命令。这是一项安全功能，
            可防止在不受信任的目录中意外执行命令。
          </Text>
        </Box>

        <RadioButtonSelect
          items={options}
          onSelect={onSelect}
          isFocused={!isRestarting}
        />
      </Box>
      {isRestarting && (
        <Box marginLeft={1} marginTop={1}>
          <Text color={Colors.AccentYellow}>
            要查看更改，必须重新启动Qwen Code。按 r 退出并立即应用更改。
          </Text>
        </Box>
      )}
    </Box>
  );
};
