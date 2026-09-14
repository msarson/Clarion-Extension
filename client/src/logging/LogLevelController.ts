import { commands, window, workspace, ConfigurationTarget, Disposable, ExtensionContext } from 'vscode';
import { LoggingConfig } from '../../../common/LoggingConfig';
import { getLanguageClient } from '../LanguageClientManager';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger('LogLevelController');

type StandardLevel = 'error' | 'warn' | 'info' | 'debug';
const LEVELS: StandardLevel[] = ['error', 'warn', 'info', 'debug'];

/** The configured level, defaulting to "error". */
export function readConfiguredLogLevel(): StandardLevel {
    const raw = workspace.getConfiguration('clarion').get<string>('log.level', 'error');
    return (LEVELS as string[]).includes(raw) ? (raw as StandardLevel) : 'error';
}

/**
 * #440 — apply `clarion.log.level` to THIS process's LoggingConfig override and,
 * when the language client is up, forward it to the server process (whose logger
 * is a separate instance). "error" clears the override, restoring the per-module
 * pins, so the common case stays override-free.
 */
export function applyConfiguredLogLevel(forwardToServer = true): StandardLevel {
    const level = readConfiguredLogLevel();
    LoggingConfig.LEVEL_OVERRIDE = LoggingConfig.normalizeOverride(level);
    if (forwardToServer) {
        try {
            getLanguageClient()?.sendNotification('clarion/setLogLevel', { level });
        } catch (err) {
            logger.warn(`could not forward log level to server: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return level;
}

/**
 * Register the `clarion.setLogLevel` palette command and a live watcher on the
 * setting. Both are folder-independent (a diagnostic control), so this is called
 * early in activation like the other no-folder commands (#513).
 */
export function registerLogLevelControl(context: ExtensionContext): Disposable[] {
    const disposables: Disposable[] = [];

    disposables.push(workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('clarion.log.level')) {
            const level = applyConfiguredLogLevel();
            logger.info(`log level changed to "${level}"`);
        }
    }));

    disposables.push(commands.registerCommand('clarion.setLogLevel', async () => {
        const current = readConfiguredLogLevel();
        const descriptions: Record<StandardLevel, string> = {
            error: 'Errors only (default)',
            warn: 'Errors and warnings — the usual level for a bug report',
            info: 'A running trace of what the extension is doing (verbose on a large solution)',
            debug: 'Everything (very verbose)',
        };
        const picked = await window.showQuickPick(
            LEVELS.map(l => ({
                label: l === current ? `$(check) ${l}` : l,
                value: l,
                description: descriptions[l],
            })),
            { placeHolder: `Clarion log level (current: ${current})`, title: 'Set Clarion Log Level' }
        );
        if (!picked) return;
        await workspace.getConfiguration('clarion').update('log.level', picked.value, ConfigurationTarget.Global);
        // The config-change watcher above applies it; report it plainly here.
        if (picked.value === 'error') {
            window.showInformationMessage('Clarion log level set to "error" (default).');
        } else {
            window.showInformationMessage(
                `Clarion log level set to "${picked.value}". Reproduce the problem, then check the ` +
                `'Clarion Extension (Client)' and 'Clarion Language Server' output channels (and .clarion-debug/client.log). ` +
                `Set it back to "error" when done.`
            );
        }
    }));

    return disposables;
}
