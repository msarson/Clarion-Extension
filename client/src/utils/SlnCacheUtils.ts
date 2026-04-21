import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from './LoggerManager';

const logger = LoggerManager.getLogger("SlnCacheUtils");
logger.setLevel("error");

/**
 * Returns the path to the .sln.cache file for a given .sln file.
 */
export function getSlnCachePath(solutionFilePath: string): string {
    return solutionFilePath + '.cache';
}

/**
 * Reads the active build configuration from a .sln.cache file.
 * Returns the full "Config|Platform" string (e.g. "Release|Win32") or null if not found.
 * The .sln.cache is an MSBuild-generated file written by the Clarion IDE after each build.
 */
export function readActiveConfigFromSlnCache(solutionFilePath: string): string | null {
    const cachePath = getSlnCachePath(solutionFilePath);
    if (!fs.existsSync(cachePath)) {
        logger.info(`ℹ️ No .sln.cache file found at: ${cachePath}`);
        return null;
    }

    try {
        const content = fs.readFileSync(cachePath, 'utf-8');
        const match = content.match(/<_SolutionProjectConfiguration>([^<]+)<\/_SolutionProjectConfiguration>/);
        if (match && match[1].trim()) {
            const fullConfig = match[1].trim();
            logger.info(`✅ Read active config from cache: ${fullConfig}`);
            return fullConfig;
        }
        logger.warn(`⚠️ _SolutionProjectConfiguration not found in: ${cachePath}`);
        return null;
    } catch (error) {
        logger.error(`❌ Failed to read .sln.cache: ${cachePath}`, error);
        return null;
    }
}

/**
 * Patches the _SolutionProjectConfiguration element in an existing .sln.cache file.
 * Does nothing if the cache file does not exist (we never synthesize one).
 * @param solutionFilePath - Path to the .sln file
 * @param fullConfig - Full "Config|Platform" string (e.g. "Release|Win32")
 */
export function patchSlnCacheConfig(solutionFilePath: string, fullConfig: string): void {
    const cachePath = getSlnCachePath(solutionFilePath);
    if (!fs.existsSync(cachePath)) {
        logger.info(`ℹ️ No .sln.cache to patch at: ${cachePath}`);
        return;
    }

    try {
        const content = fs.readFileSync(cachePath, 'utf-8');
        const updated = content.replace(
            /(<_SolutionProjectConfiguration>)[^<]*(<\/_SolutionProjectConfiguration>)/g,
            `$1${fullConfig}$2`
        );
        if (updated === content) {
            logger.warn(`⚠️ _SolutionProjectConfiguration tag not found for patching in: ${cachePath}`);
            return;
        }
        fs.writeFileSync(cachePath, updated, 'utf-8');
        logger.info(`✅ Patched .sln.cache with config: ${fullConfig}`);
    } catch (error) {
        logger.error(`❌ Failed to patch .sln.cache: ${cachePath}`, error);
    }
}

/**
 * Extracts the configuration name from a full "Config|Platform" string.
 * e.g. "Release|Win32" → "Release"
 */
export function configNameFromFull(fullConfig: string): string {
    return fullConfig.split('|')[0].trim();
}

/**
 * Builds a full "Config|Platform" string from a config name and an optional platform.
 * If existingFull is provided, preserves its platform part.
 * e.g. ("Release", "Debug|Win32") → "Release|Win32"
 */
export function buildFullConfig(configName: string, existingFull?: string | null): string {
    const platform = existingFull ? existingFull.split('|').slice(1).join('|') : 'Any CPU';
    return platform ? `${configName}|${platform}` : configName;
}
