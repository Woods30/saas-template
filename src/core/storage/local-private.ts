import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  StorageObject,
  StorageProvider,
  StorageUploadOptions,
  StorageUploadResult,
} from '.';

/**
 * Local-disk provider for objects that must never be publicly reachable —
 * payment receipts. They are written under `data/uploads/` (git-ignored) and
 * served only by an authenticated server route, unlike `public/uploads/`.
 *
 * `PRIVATE_UPLOAD_DIR` lets tests point at a scratch directory; production
 * always uses the default.
 */
export class LocalPrivateProvider implements StorageProvider {
  readonly name = 'local_private';
  configs: Record<string, string> = {};

  private root() {
    return (
      process.env.PRIVATE_UPLOAD_DIR ||
      path.join(process.cwd(), 'data', 'uploads')
    );
  }

  private resolve(key: string) {
    // Keys come from our own code, but a key with `..` must never escape root.
    const target = path.resolve(this.root(), key);
    const root = path.resolve(this.root());
    if (!target.startsWith(root + path.sep)) {
      throw new Error('Invalid storage key');
    }
    return target;
  }

  async uploadFile(
    options: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    try {
      const target = this.resolve(options.key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, options.body);
      return {
        success: true,
        key: options.key,
        uploadPath: path.dirname(options.key),
        filename: options.key.split('/').pop(),
        provider: this.name,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: this.name,
      };
    }
  }

  getObject = async (options: {
    key: string;
    bucket?: string;
  }): Promise<StorageObject | null> => {
    try {
      const target = this.resolve(options.key);
      const body = new Uint8Array(await readFile(target));
      return { body, contentType: contentTypeFromKey(options.key) };
    } catch {
      return null;
    }
  };

  async downloadAndUpload(options: {
    url: string;
    key: string;
  }): Promise<StorageUploadResult> {
    try {
      const response = await fetch(options.url);
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP error! status: ${response.status}`,
          provider: this.name,
        };
      }
      return this.uploadFile({
        key: options.key,
        body: new Uint8Array(await response.arrayBuffer()),
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: this.name,
      };
    }
  }
}

/**
 * The file extension is the only thing we trust for the content type here —
 * the object was written by us with an extension derived from a validated
 * MIME allow-list.
 */
export function contentTypeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
  };
  return (ext && map[ext]) || 'application/octet-stream';
}
