/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enum for approval modes with UI-friendly labels
 * Represents the different approval modes available in the ACP protocol
 * with their corresponding user-facing display names
 */
export enum ApprovalMode {
  PLAN = 'plan',
  DEFAULT = 'default',
  YOLO = 'yolo',
}

/**
 * Mapping from string values to enum values for runtime conversion
 */
export const APPROVAL_MODE_MAP: Record<string, ApprovalMode> = {
  plan: ApprovalMode.PLAN,
  default: ApprovalMode.DEFAULT,
  yolo: ApprovalMode.YOLO,
};

/**
 * UI display information for each approval mode
 */
export const APPROVAL_MODE_INFO: Record<
  ApprovalMode,
  {
    label: string;
    title: string;
    iconType?: 'edit' | 'auto' | 'plan' | 'yolo';
  }
> = {
  [ApprovalMode.PLAN]: {
    label: 'Plan mode',
    title: 'Qwen will plan before executing. Click to switch modes.',
    iconType: 'plan',
  },
  [ApprovalMode.DEFAULT]: {
    label: 'Ask before edits',
    title: 'Qwen will ask before each edit. Click to switch modes.',
    iconType: 'edit',
  },
  [ApprovalMode.YOLO]: {
    label: 'YOLO',
    title: 'Automatically approve all tools. Click to switch modes.',
    iconType: 'yolo',
  },
};

/**
 * Get UI display information for an approval mode from string value
 */
export function getApprovalModeInfoFromString(mode: string): {
  label: string;
  title: string;
  iconType?: 'edit' | 'auto' | 'plan' | 'yolo';
} {
  const enumValue = APPROVAL_MODE_MAP[mode];
  if (enumValue !== undefined) {
    return APPROVAL_MODE_INFO[enumValue];
  }
  return {
    label: 'Unknown mode',
    title: 'Unknown edit mode',
    iconType: undefined,
  };
}
