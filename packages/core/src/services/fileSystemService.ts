/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs, { existsSync, mkdirSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import crypto from 'node:crypto';
import { globSync } from 'glob';

export const FileEncoding = {
  UTF8: 'utf-8',
  UTF8_BOM: 'utf-8-bom',
} as const;

export type FileEncodingType = (typeof FileEncoding)[keyof typeof FileEncoding];

export enum FileOperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}

export interface CommitIntent {
  filePath: string;
  operation: FileOperationType;
  originalHash: string | null;
  committedContent: string;
  versionBefore: string | null;
  versionAfter: string;
  timestamp: number;
}

export interface _commitResult {
  success: boolean;
  error?: string;
  versionId?: string;
  currentHash?: string;
}

export interface VersionMetadata {
  versionId: string;
  filePath: string;
  timestamp: number;
  size: number;
  hash: string;
  previousVersion?: string;
  nextVersion?: string;
}

export interface WriteTextFileOptions {
  bom?: boolean;
}

export class VersionArchiveService {
  private archiveRoot: string;
  private metadataRoot: string;

  constructor(archiveRoot: string) {
    this.archiveRoot = archiveRoot;
    this.metadataRoot = path.join(archiveRoot, 'metadata');
    if (!existsSync(this.metadataRoot)) {
      mkdirSync(this.metadataRoot, { recursive: true });
    }
  }

  private getFileArchiveDir(filePath: string): string {
    const fileHash = crypto.createHash('sha256').update(filePath).digest('hex');
    return path.join(this.archiveRoot, fileHash);
  }

  private getVersionMetadataPath(filePath: string, versionId: string): string {
    const fileHash = crypto.createHash('sha256').update(filePath).digest('hex');
    return path.join(this.metadataRoot, `${fileHash}_${versionId}.json`);
  }

  archive(filePath: string, content: string, versionId: string): void {
    const archiveDir = this.getFileArchiveDir(filePath);
    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true });
    }

    const archivePath = path.join(archiveDir, `${versionId}.txt`);
    fs.writeFileSync(archivePath, content, 'utf-8');

    const metadata: VersionMetadata = {
      versionId,
      filePath,
      timestamp: Date.now(),
      size: content.length,
      hash: crypto.createHash('sha256').update(content).digest('hex'),
    };

    const metadataPath = this.getVersionMetadataPath(filePath, versionId);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  retrieve(filePath: string, versionId: string): string | null {
    const archiveDir = this.getFileArchiveDir(filePath);
    const archivePath = path.join(archiveDir, `${versionId}.txt`);

    try {
      return fs.readFileSync(archivePath, 'utf-8');
    } catch (_err) {
      return null;
    }
  }

  listVersions(filePath: string): string[] {
    const archiveDir = this.getFileArchiveDir(filePath);

    try {
      const files = fs.readdirSync(archiveDir);
      return files
        .filter((f) => f.endsWith('.txt'))
        .map((f) => f.replace('.txt', ''))
        .sort();
    } catch (_err) {
      return [];
    }
  }

  getMetadata(filePath: string, versionId: string): VersionMetadata | null {
    const metadataPath = this.getVersionMetadataPath(filePath, versionId);

    try {
      const data = fs.readFileSync(metadataPath, 'utf-8');
      return JSON.parse(data) as VersionMetadata;
    } catch (_err) {
      return null;
    }
  }
}

export interface FileSystemService {
  readTextFile(filePath: string): Promise<string>;
  writeTextFile(
    filePath: string,
    content: string,
    options?: WriteTextFileOptions,
  ): Promise<void>;
  detectFileBOM(filePath: string): Promise<boolean>;
  findFiles(fileName: string, searchPaths: readonly string[]): string[];
}

export interface VersionedFileSystemService {
  readTextFile(filePath: string): Promise<string>;
  computeFileHash(filePath: string): Promise<string | null>;
  commitWrite(intent: CommitIntent): Promise<_commitResult>;
  commitDelete(intent: CommitIntent): Promise<_commitResult>;
  commitCreate(intent: CommitIntent): Promise<_commitResult>;
  archiveVersion(
    filePath: string,
    content: string,
    versionId: string,
  ): Promise<void>;
  getVersion(filePath: string, versionId: string): Promise<string | null>;
  listVersions(filePath: string): Promise<string[]>;
}

export class StandardFileSystemService
  implements FileSystemService, VersionedFileSystemService
{
  private versionArchive: VersionArchiveService;

  constructor(archiveRoot?: string) {
    const root = archiveRoot || '.qwen/versions';
    this.versionArchive = new VersionArchiveService(root);
  }

  readTextFile(filePath: string): Promise<string> {
    return fsPromises.readFile(filePath, 'utf-8');
  }

  computeFileHash(filePath: string): Promise<string | null> {
    return fsPromises
      .readFile(filePath, 'utf-8')
      .then((content) =>
        crypto.createHash('sha256').update(content).digest('hex'),
      )
      .catch((err: unknown) => {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
          return null;
        }
        throw err;
      });
  }

  commitWrite(intent: CommitIntent): Promise<_commitResult> {
    return this.computeFileHash(intent.filePath).then((currentHash) => {
      if (currentHash !== intent.originalHash) {
        return {
          success: false,
          error: 'HASH_MISMATCH',
          currentHash: currentHash || undefined,
        };
      }

      if (intent.operation === FileOperationType.UPDATE && currentHash) {
        return this.readTextFile(intent.filePath).then((currentContent) => {
          this.versionArchive.archive(
            intent.filePath,
            currentContent,
            intent.versionAfter,
          );
          return this.performAtomicWrite(intent);
        });
      }

      return this.performAtomicWrite(intent);
    });
  }

  commitDelete(intent: CommitIntent): Promise<_commitResult> {
    return this.readTextFile(intent.filePath)
      .then((currentContent) => {
        this.versionArchive.archive(
          intent.filePath,
          currentContent,
          intent.versionAfter,
        );
        return fsPromises
          .unlink(intent.filePath)
          .then(() => ({ success: true, versionId: intent.versionAfter }))
          .catch((err: unknown) => ({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }));
      })
      .catch(() =>
        fsPromises
          .unlink(intent.filePath)
          .then(() => ({ success: true, versionId: intent.versionAfter }))
          .catch((err: unknown) => ({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          })),
      );
  }

  commitCreate(intent: CommitIntent): Promise<_commitResult> {
    return this.readTextFile(intent.filePath)
      .then((currentContent) => {
        this.versionArchive.archive(
          intent.filePath,
          currentContent,
          intent.versionAfter,
        );
        return this.commitWrite(intent);
      })
      .catch(() => this.commitWrite(intent));
  }

  archiveVersion(
    filePath: string,
    content: string,
    versionId: string,
  ): Promise<void> {
    return Promise.resolve(
      this.versionArchive.archive(filePath, content, versionId),
    );
  }

  getVersion(filePath: string, versionId: string): Promise<string | null> {
    return Promise.resolve(this.versionArchive.retrieve(filePath, versionId));
  }

  listVersions(filePath: string): Promise<string[]> {
    return Promise.resolve(this.versionArchive.listVersions(filePath));
  }

  private performAtomicWrite(intent: CommitIntent): Promise<_commitResult> {
    const tempSuffix = `.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const tempPath = path.join(
      path.dirname(intent.filePath),
      `.${path.basename(intent.filePath)}${tempSuffix}`,
    );

    return fsPromises
      .writeFile(tempPath, intent.committedContent, 'utf-8')
      .then(() => fsPromises.rename(tempPath, intent.filePath))
      .then(() => ({ success: true, versionId: intent.versionAfter }))
      .catch((err: unknown) => {
        fsPromises.unlink(tempPath).catch(() => {});
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      });
  }

  writeTextFile(
    filePath: string,
    content: string,
    options?: WriteTextFileOptions,
  ): Promise<void> {
    const bom = options?.bom ?? false;

    if (bom) {
      const normalizedContent =
        content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
      const bomBuffer = Buffer.from([0xef, 0xbb, 0xbf]);
      const contentBuffer = Buffer.from(normalizedContent, 'utf-8');
      return fsPromises.writeFile(
        filePath,
        Buffer.concat([bomBuffer, contentBuffer]),
      );
    } else {
      return fsPromises.writeFile(filePath, content, 'utf-8');
    }
  }

  detectFileBOM(filePath: string): Promise<boolean> {
    let fd: fsPromises.FileHandle | undefined;
    return fsPromises
      .open(filePath, 'r')
      .then((handle) => {
        fd = handle;
        const buffer = Buffer.alloc(3);
        return fd.read(buffer, 0, 3, 0);
      })
      .then(({ bytesRead, buffer }) => {
        if (bytesRead < 3) {
          return false;
        }
        return (
          bytesRead >= 3 &&
          buffer[0] === 0xef &&
          buffer[1] === 0xbb &&
          buffer[2] === 0xbf
        );
      })
      .catch(() => false)
      .finally(() => {
        fd?.close();
      });
  }

  findFiles(fileName: string, searchPaths: readonly string[]): string[] {
    return searchPaths.flatMap((searchPath) => {
      const pattern = path.posix.join(searchPath, '**', fileName);
      return globSync(pattern, {
        nodir: true,
        absolute: true,
      });
    });
  }
}
