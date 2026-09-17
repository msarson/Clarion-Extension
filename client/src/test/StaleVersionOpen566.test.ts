import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateRememberedSettings } from '../utils/SolutionFallbackPolicy';

/**
 * #566 — clicking a solution in the Solution View reuses the settings the folder
 * remembers for it when they are valid. A version the selected ClarionProperties.xml
 * no longer registers (#535) passed the check, so the opener said "Clarion Solution
 * Opened", initializeSolution then stopped at the stale-version guard, and no version
 * picker was ever offered.
 */
const PROPERTIES_XML = `<?xml version="1.0" encoding="utf-8"?>
<ClarionProperties xmlns="http://www.softvelocity.com/schemas/Clarion/Properties">
  <Properties name="Clarion.Versions">
    <Properties name="Clarion 12.0.14313">
      <path value="C:\\Clarion\\Clarion12-12.0.14204\\bin" />
    </Properties>
    <Properties name="Clarion.NET 4.0.14313">
      <path value="C:\\Clarion\\Clarion12-12.0.14204\\bin" />
    </Properties>
  </Properties>
</ClarionProperties>`;

suite('validateRememberedSettings (#566)', () => {
    let dir: string;
    let sln: string;
    let props: string;

    setup(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clarion-566-'));
        sln = path.join(dir, 'VitTransform.sln');
        props = path.join(dir, 'ClarionProperties.xml');
        fs.writeFileSync(sln, '');
        fs.writeFileSync(props, PROPERTIES_XML);
    });

    teardown(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('a remembered version the properties file no longer registers is not valid', () => {
        const result = validateRememberedSettings(sln, props, 'Clarion 12.0.14234');
        assert.strictEqual(result.valid, false);
        assert.match(result.reason ?? '', /Clarion 12\.0\.14234/);
        assert.match(result.reason ?? '', /no longer registered/);
    });

    test('a registered version is valid', () => {
        assert.deepStrictEqual(validateRememberedSettings(sln, props, 'Clarion 12.0.14313'), { valid: true });
    });

    test('the existing checks still apply', () => {
        assert.strictEqual(validateRememberedSettings(sln, path.join(dir, 'missing.xml'), 'Clarion 12.0.14313').valid, false);
        assert.strictEqual(validateRememberedSettings(path.join(dir, 'missing.sln'), props, 'Clarion 12.0.14313').valid, false);
        assert.strictEqual(validateRememberedSettings(sln, props, '').valid, false);
    });
});
