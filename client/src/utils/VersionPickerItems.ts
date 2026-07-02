import { QuickPickItem } from 'vscode';
import { ClarionInstallation } from './ClarionInstallationDetector';

/**
 * #134 / 972b3040 — pure QuickPickItem builders for the two-stage version picker.
 *
 * Terminology (locked with Mark 2026-05-11):
 *   - Clarion Installation — an installed IDE (e.g. "Clarion 11.0"), one
 *     ClarionProperties.xml per Installation. Discovered by
 *     ClarionInstallationDetector.
 *   - Compile Target — an entry inside an Installation's Clarion.Versions XML
 *     block (e.g. "Clarion 11.1.13855", "Clarion6IBS").
 *
 * Stage 1 lists Compile Targets within one Installation + appends a "switch
 * Installation" sentinel item. Stage 2 lists Installations.
 *
 * vscode-free apart from the QuickPickItem type (a plain interface) so these
 * are unit-testable without a VS Code test harness.
 */

export interface CompileTargetPickItem extends QuickPickItem {
    /** The Compile Target name; undefined for the switch-Installation + set-as-default sentinels. */
    targetName?: string;
    /** True for the bottom "↩ Switch Clarion installation…" entry. */
    isSwitchInstallation?: boolean;
    /** #141 Q6 — true for the "⚙ Set as default for new solutions" sentinel. */
    isSetAsDefault?: boolean;
}

export interface InstallationPickItem extends QuickPickItem {
    ideVersion: string;
    propertiesPath: string;
}

/**
 * Build Stage-1 QuickPickItems — every Compile Target in the Installation,
 * followed by a "↩ Switch Clarion installation…" sentinel.
 *
 * The currently-active Compile Target is visually marked with a check + the
 * "(current)" suffix in description. activeCompileTargetName === null skips
 * any marking.
 */
export function buildCompileTargetItems(
    installation: ClarionInstallation,
    activeCompileTargetName: string | null
): CompileTargetPickItem[] {
    const items: CompileTargetPickItem[] = installation.compilerVersions.map(cv => {
        const isActive = activeCompileTargetName !== null && cv.name === activeCompileTargetName;
        return {
            label: cv.name,
            description: isActive ? '$(check) (current)' : undefined,
            targetName: cv.name,
        };
    });

    items.push({
        label: '$(arrow-left) Switch Clarion installation…',
        description: 'Pick a different Clarion IDE installation',
        isSwitchInstallation: true,
    });

    return items;
}

/**
 * #141 Q6 — build the "⚙ Set as default for new solutions" footer item.
 *
 * Renders into the Stage-1 picker (after Compile Targets + switch-Installation
 * sentinel). When picked, the caller writes the CURRENT effective active
 * version (compileTargetName + propertiesPath) to L1 via
 * `SettingsStorageManager.setDefaultVersion`.
 *
 * The label embeds the current effective version + Clarion installation
 * label for explicitness ("Set 'C11.0.13855' (Clarion 11.0 installation)
 * as default…"). The description shows the current default state — when
 * the effective version IS already the default, the description marks
 * "$(check) (current default)" so the user sees there's nothing to do.
 *
 * Returns `null` if no current effective version (`currentCompileTargetName`
 * or `currentInstallationLabel` empty) — the footer is only meaningful
 * when there's a concrete L2 effective active to promote to L1.
 */
export function buildSetAsDefaultFooterItem(
    currentCompileTargetName: string | null,
    currentInstallationLabel: string | null,
    currentDefaultCompileTargetName: string | null
): CompileTargetPickItem | null {
    if (!currentCompileTargetName || !currentInstallationLabel) {
        return null;
    }

    const isAlreadyDefault =
        currentDefaultCompileTargetName !== null
        && currentDefaultCompileTargetName === currentCompileTargetName;

    return {
        label: `$(gear) Set "${currentCompileTargetName}" (${currentInstallationLabel}) as default for new solutions`,
        description: isAlreadyDefault ? '$(check) (current default)' : undefined,
        detail: isAlreadyDefault
            ? `This compile target is already your default.`
            : `Updates the cross-instance shared default; per-instance effective active versions remain unchanged.`,
        isSetAsDefault: true,
    };
}

/**
 * Build Stage-2 QuickPickItems — every detected Clarion Installation with
 * its full propertiesPath + compile-target count in detail.
 *
 * The currently-active Installation (matched by propertiesPath) is visually
 * marked with a check + "(current)". activePropertiesPath === null skips
 * any marking.
 */
export function buildInstallationItems(
    installations: ClarionInstallation[],
    activePropertiesPath: string | null
): InstallationPickItem[] {
    return installations.map(inst => {
        const isActive = activePropertiesPath !== null && inst.propertiesPath === activePropertiesPath;
        const targetCount = inst.compilerVersions.length;
        const noun = targetCount === 1 ? 'compile target' : 'compile targets';
        return {
            label: `Clarion ${inst.ideVersion}`,
            description: isActive ? '$(check) (current)' : undefined,
            detail: `${inst.propertiesPath} — ${targetCount} ${noun}`,
            ideVersion: inst.ideVersion,
            propertiesPath: inst.propertiesPath,
        };
    });
}
