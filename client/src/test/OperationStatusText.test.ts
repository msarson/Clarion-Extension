import { describe, it } from 'mocha';
import * as assert from 'assert';
import { buildOperationStatusText } from '../statusbar/OperationStatusText';

describe('OperationStatusText', () => {
    it('formats running build status with detail', () => {
        const text = buildOperationStatusText('build', 'running', 'Building ProjectA...');
        assert.strictEqual(text, '$(sync~spin) Clarion Build: Building ProjectA...');
    });

    it('formats successful generation status without detail', () => {
        const text = buildOperationStatusText('generation', 'success');
        assert.strictEqual(text, '$(check) Clarion Generation: Succeeded');
    });
});
