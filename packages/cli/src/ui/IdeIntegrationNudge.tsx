/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type DetectedIde, getIdeInfo } from '@qwen-code/qwen-code-core';
import { Box, Text } from 'ink';
import type { RadioSelectItem } from './components/shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './components/shared/RadioButtonSelect.js';
import { useKeypress } from './hooks/useKeypress.js';

export type IdeIntegrationNudgeResult = {
  userSelection: 'yes' | 'no' | 'dismiss';
  isExtensionPreInstalled: boolean;
};

interface IdeIntegrationNudgeProps {
  ide: DetectedIde;
  onComplete: (result: IdeIntegrationNudgeResult) => void;
}

export function IdeIntegrationNudge({
  ide,
  onComplete,
}: IdeIntegrationNudgeProps) {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onComplete({
          userSelection: 'no',
          isExtensionPreInstalled: false,
        });
      }
    },
    { isActive: true },
  );

  const { displayName: ideName } = getIdeInfo(ide);
  // Assume extension is already installed if the env variables are set.
  const isExtensionPreInstalled =
    !!process.env['QWEN_CODE_IDE_SERVER_PORT'] &&
    !!process.env['QWEN_CODE_IDE_WORKSPACE_PATH'];

  const OPTIONS: Array<RadioSelectItem<IdeIntegrationNudgeResult>> = [
    {
      label: '是',
      value: {
        userSelection: 'yes',
        isExtensionPreInstalled,
      },
    },
    {
      label: '否 (esc)',
      value: {
        userSelection: 'no',
        isExtensionPreInstalled,
      },
    },
    {
      label: "否，不再询问",
      value: {
        userSelection: 'dismiss',
        isExtensionPreInstalled,
      },
    },
  ];

  const installText = isExtensionPreInstalled
    ? `如果您选择是，CLI 将能够访问您的打开文件并直接在 ${
        ideName ?? '您的编辑器'
      } 中显示差异。`
    : `如果您选择是，我们将安装一个扩展，该扩展允许 CLI 访问您的打开文件并直接在 ${
        ideName ?? '您的编辑器'
      } 中显示差异。`;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      padding={1}
      width="100%"
      marginLeft={1}
    >
      <Box marginBottom={1} flexDirection="column">
        <Text>
          <Text color="yellow">{'> '}</Text>
          {`您想将 ${ideName ?? '您的编辑器'} 连接到 Qwen Code 吗？`}
        </Text>
        <Text dimColor>{installText}</Text>
      </Box>
      <RadioButtonSelect items={OPTIONS} onSelect={onComplete} />
    </Box>
  );
}
