import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Creates a temporary directory with the given prefix.
 */
export function createTempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Removes a directory with retry logic for Windows EBUSY errors.
 * Tries up to 3 times with a small delay between attempts.
 */
export function removeTempDir(dir: string): void {
	for (let i = 0; i < 3; i++) {
		try {
			rmSync(dir, { force: true, recursive: true });
			return;
		} catch (error) {
			if (i === 2) return; // Last attempt, give up silently
			// Small delay before retry
		}
	}
}

/**
 * Removes a file with retry logic for Windows EBUSY errors.
 * Tries up to 3 times with a small delay between attempts.
 */
export function removeTempFile(file: string): void {
	for (let i = 0; i < 3; i++) {
		try {
			rmSync(file, { force: true });
			return;
		} catch (error) {
			if (i === 2) return; // Last attempt, give up silently
		}
	}
}

/**
 * Manages a collection of temporary directories for test cleanup.
 */
export class TempDirManager {
	private dirs: string[] = [];

	create(prefix: string): string {
		const dir = createTempDir(prefix);
		this.dirs.push(dir);
		return dir;
	}

	cleanup(): void {
		for (const dir of this.dirs) {
			removeTempDir(dir);
		}
		this.dirs = [];
	}

	getDirs(): string[] {
		return this.dirs;
	}
}

/**
 * Manages a collection of temporary database files for test cleanup.
 */
export class TempDbManager {
	private paths: string[] = [];

	create(prefix: string): string {
		const dir = createTempDir(prefix);
		const path = join(dir, "balancer.sqlite");
		this.paths.push(path);
		return path;
	}

	cleanup(closeDb: (path: string) => void): void {
		for (const path of this.paths) {
			try {
				closeDb(path);
			} catch {}
		}
		for (const path of this.paths) {
			removeTempFile(path);
			removeTempFile(`${path}-wal`);
			removeTempFile(`${path}-shm`);
		}
		// Also clean up parent directories
		const dirs = new Set(this.paths.map((p) => join(p, "..")));
		for (const dir of dirs) {
			removeTempDir(dir);
		}
		this.paths = [];
	}

	getPaths(): string[] {
		return this.paths;
	}
}