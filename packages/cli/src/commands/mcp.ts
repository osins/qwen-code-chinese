/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// File for 'gemini mcp' command
import type { CommandModule, Argv } from 'yargs';
import './mcp/add.js';
import './mcp/remove.js';
import './mcp/list.js';

export const mcpCommand: CommandModule = {
  command: 'mcp',
  describe: '管理 MCP 服务',
  builder: (yargs: Argv) => yargs
      .commandDir('mcp', {
        extensions: ['ts', 'tsx'],
      })
      .demandCommand(1, '继续之前您至少需要一个命令。')
      .help()
      .alias('h', 'help')
      .wrap(yargs.terminalWidth() * 0.8)
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
    // thanks to demandCommand(1) in the builder.
  },
};
