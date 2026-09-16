import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #564 wiring sentinel. The server-side behaviour is pinned in ConfigurationChange564 (server
 * suite); this pins that the change is actually sent and received: the client's single apply
 * point for a configuration change (the picker and a hand edit both go through it, #563) sends
 * `clarion/updateConfiguration`, and the server registers a handler for it.
 */
suite('A configuration change is sent to the language server (#564)', () => {
    const root = (() => {
        let dir = __dirname;
        while (dir !== path.dirname(dir)) {
            if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
            dir = path.dirname(dir);
        }
        throw new Error('project root not found');
    })();

    test('applyActiveConfiguration sends clarion/updateConfiguration', () => {
        const text = fs.readFileSync(path.join(root, 'client', 'src', 'config', 'ConfigurationManager.ts'), 'utf8');
        const start = text.indexOf('export async function applyActiveConfiguration(');
        assert.ok(start >= 0, 'applyActiveConfiguration exists');
        const end = text.indexOf('\n}', start);
        const body = text.slice(start, end);
        assert.ok(/sendNotification\(\s*['"]clarion\/updateConfiguration['"]/.test(body), body);
    });

    test('the server handles clarion/updateConfiguration', () => {
        const text = fs.readFileSync(path.join(root, 'server', 'src', 'server.ts'), 'utf8');
        assert.ok(/onNotification\(\s*['"]clarion\/updateConfiguration['"]/.test(text));
    });
});
