import { describe, it } from 'mocha';
import * as assert from 'assert';
import { solutionDialogStartFolder } from '../solution/SolutionDialogStart';

/**
 * #762 — the Open Solution dialog started in the active file's folder (a project's SRC
 * sub-folder). It starts at the current solution's folder, else the most recent
 * solution's, else the workspace folder: the first that exists.
 */
describe('Open Solution dialog start folder (#762)', () => {
    const existing = new Set(['C:\\Sys\\ProjA', 'C:\\Sys\\ProjB', 'C:\\Sys']);
    const exists = (p: string) => existing.has(p);
    const recent = [
        { solutionFile: 'C:\\Sys\\ProjB\\ProjB.sln', lastOpened: new Date('2026-10-01') },
        { solutionFile: 'C:\\Sys\\ProjA\\ProjA.sln', lastOpened: new Date('2026-10-20') },
    ];

    it('the current solution folder comes first', () => {
        assert.strictEqual(solutionDialogStartFolder('C:\\Sys\\ProjB\\ProjB.sln', recent, 'C:\\Sys', exists), 'C:\\Sys\\ProjB');
    });

    it('with no current solution, the most recently opened one', () => {
        assert.strictEqual(solutionDialogStartFolder(undefined, recent, 'C:\\Sys', exists), 'C:\\Sys\\ProjA');
    });

    it('then the workspace folder, skipping folders that no longer exist', () => {
        const gone = [{ solutionFile: 'D:\\Old\\Old.sln', lastOpened: new Date('2026-10-21') }];
        assert.strictEqual(solutionDialogStartFolder('D:\\Old\\Old.sln', gone, 'C:\\Sys', exists), 'C:\\Sys');
    });

    it('nothing known: no start folder, VS Code decides', () => {
        assert.strictEqual(solutionDialogStartFolder(undefined, [], undefined, exists), undefined);
    });
});
