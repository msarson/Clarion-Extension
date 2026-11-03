/**
 * #792 — New Solution's page, all of it, without vscode: what the solution builds with (the Clarion
 * installation, compiler version and configuration, settled as the Solution page settles them),
 * whether it starts from the programs already in the folder or a new empty program, and the name.
 * It replaced the quick picks that came before the review page (installation, compiler, "Build
 * from…") and the empty program's own prompts (configuration, name, main file).
 */
import { buildReviewState, CONFIGURATIONS, NewProjectSpec, ReviewChoices, ReviewInput, reviewResult, ReviewState, solutionNameError } from './NewSolutionReview';
import { ChoiceField, InstallationOption, mainFileError, settleChoice, SolutionChoice } from './SolutionPage';

export interface FormInput {
    /** The folder the solution is made in; '' until one is chosen (no folder is open). */
    folder: string;
    installations: InstallationOption[];
    /** The programs the folder holds; 0 when it holds none, or too many files to read. */
    programs: number;
    /** The folder holds more sources than New Solution reads. */
    tooLarge: boolean;
    /** The folder's proposal for the chosen installation, compiler and configuration, once worked out. */
    review?: ReviewInput;
}

export type StartFrom = 'programs' | 'empty';

export interface FormChoices extends ReviewChoices {
    propertiesFile?: string;
    version?: string;
    start: StartFrom;
    /** The empty program's main file; undefined while it follows the solution name. */
    mainFile?: string;
}

export interface FormState {
    title: string;
    folder: { value: string; needs: boolean };
    installation: ChoiceField;
    version: ChoiceField;
    configuration: string;
    configurations: string[];
    start: { value: StartFrom; offered: boolean; programs: number; why?: string };
    /** The projects from the folder's programs, once worked out. */
    review?: ReviewState;
    /** Why they are not shown yet. */
    waiting?: string;
    name: string;
    nameError?: string;
    mainFile: string;
    mainFileError?: string;
    createLabel: string;
    canCreate: boolean;
}

export type FormResult = { folder: string; propertiesFile: string; compiler: string; configuration: string; name: string }
    & ({ start: 'programs'; specs: NewProjectSpec[]; missingProgram: string[] } | { start: 'empty'; mainFile: string });


/** The page's first choices: the remembered installation and version where they are offered, else a lone one. */
export function defaultFormChoices(input: FormInput, name: string, remembered: SolutionChoice): FormChoices {
    const settled = settleChoice(input.installations, remembered, CONFIGURATIONS);
    return {
        included: {}, kinds: {}, placement: {}, kept: {},
        name,
        configuration: CONFIGURATIONS[0],
        propertiesFile: settled.propertiesFile,
        version: settled.version,
        start: input.programs > 0 ? 'programs' : 'empty',
    };
}

/** The installation and version as chosen, a lone option taken where nothing is. */
function buildWith(input: FormInput, choices: FormChoices) {
    const settled = settleChoice(input.installations, { propertiesFile: choices.propertiesFile, version: choices.version }, CONFIGURATIONS);
    const installation = input.installations.find(i => i.propertiesFile === settled.propertiesFile);
    return { installation, version: settled.version };
}

function mainFileOf(choices: FormChoices): string {
    return choices.mainFile ?? `${choices.name.trim() || 'Program'}.clw`;
}

export function buildFormState(input: FormInput, choices: FormChoices): FormState {
    const { installation, version } = buildWith(input, choices);
    const chosen = !!installation && !!version;
    const start = input.programs > 0 ? choices.start : 'empty';
    const review = start === 'programs' && chosen && input.review ? buildReviewState(input.review, choices) : undefined;
    const mainFile = mainFileOf(choices);
    const fileError = start === 'empty' ? mainFileError(mainFile) : undefined;
    const nameError = solutionNameError(choices.name);
    return {
        title: input.folder ? `New solution in ${input.folder}` : 'New solution',
        folder: { value: input.folder, needs: !input.folder },
        installation: {
            value: installation?.propertiesFile ?? '',
            options: input.installations.map(i => ({ value: i.propertiesFile, label: `Clarion ${i.ideVersion}` })),
            needs: !installation,
        },
        version: {
            value: version ?? '',
            options: (installation?.compilers ?? []).map(c => ({ value: c, label: c })),
            needs: !version,
        },
        configuration: choices.configuration,
        configurations: CONFIGURATIONS,
        start: {
            value: start,
            offered: input.programs > 0,
            programs: input.programs,
            why: input.tooLarge
                ? 'This folder holds too many Clarion sources to be one application, so New Solution does not build projects from them. Open the application\'s own folder to do that.'
                : undefined,
        },
        review,
        waiting: start !== 'programs' || review ? undefined
            : !input.folder ? 'Choose the folder to see its projects.'
            : chosen ? 'Finding the projects…' : 'Choose the Clarion installation and compiler version to see the projects.',
        name: choices.name,
        nameError,
        mainFile,
        mainFileError: fileError,
        createLabel: start === 'empty' ? 'Create the solution' : review?.createLabel ?? 'Create',
        canCreate: chosen && !!input.folder && !nameError && (start === 'empty' ? !fileError : !!review?.canCreate),
    };
}

/** What New Solution writes and opens; undefined while the page cannot create. */
export function formResult(input: FormInput, choices: FormChoices): FormResult | undefined {
    const state = buildFormState(input, choices);
    if (!state.canCreate) return undefined;
    const base = { folder: input.folder, propertiesFile: state.installation.value, compiler: state.version.value, configuration: choices.configuration, name: choices.name.trim() };
    if (state.start.value === 'empty') return { ...base, start: 'empty', mainFile: state.mainFile.trim() };
    const result = input.review && reviewResult(input.review, choices);
    return result && input.review
        ? { ...base, start: 'programs', specs: result.specs, missingProgram: input.review.inference.missingProgram }
        : undefined;
}

