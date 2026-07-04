import { describe, it } from 'mocha';
import * as assert from 'assert';
import { buildInitializationStatusText } from '../statusbar/InitializationStatusText';

describe('InitializationStatusText', () => {
    it('formats loading solution text with detail', () => {
        const text = buildInitializationStatusText('loading-solution', 'MyApp.sln');
        assert.strictEqual(text, '$(sync~spin) Clarion: Loading solution MyApp.sln...');
    });

    it('formats indexing text without detail', () => {
        const text = buildInitializationStatusText('indexing-solution');
        assert.strictEqual(text, '$(sync~spin) Clarion: Indexing solution...');
    });
});
