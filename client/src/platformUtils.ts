// platformUtils.ts

export class PlatformUtils {
    static isWindows(): boolean {
        return process.platform === 'win32';
    }

    static isMac(): boolean {
        return process.platform === 'darwin';
    }

    static isLinux(): boolean {
        return process.platform === 'linux';
    }

    static getPlatformName(): string {
        switch (process.platform) {
            case 'win32': return 'Windows';
            case 'darwin': return 'macOS';
            case 'linux': return 'Linux';
            default: return 'Unknown';
        }
    }
}
