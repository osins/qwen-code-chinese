/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import './extensions/install.js';
import './extensions/uninstall.js';
import './extensions/list.js';
import './extensions/update.js';
import './extensions/disable.js';
import './extensions/enable.js';

export const extensionsCommand: CommandModule = {
  command: 'extensions <command>',
  describe: 'Manage Qwen Code extensions.',
  builder: (yargs) => {
    return yargs
      .commandDir('extensions', {
        extensions: ['ts', 'tsx'],
      })
      .demandCommand(1, '继续之前您至少需要一个命令。')
      .help()
      .alias('h', 'help')
      .wrap(yargs.terminalWidth() * 0.8)
      .version(false);
  },
  handler: () => {
    // This handler is not called when a subcommand is provided.
    // Yargs will show the help menu.
  },
};
