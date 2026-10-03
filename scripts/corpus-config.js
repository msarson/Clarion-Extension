// Where the local test corpus lives — WITHOUT naming it.
//
// The solution these scripts measure against is a client's private source, and this file is
// committed to a public repository, so no path, project name or file name belongs here. Each
// value is resolved from, in order:
//
//   1. an environment variable
//   2. `scripts/local-corpus.js` — gitignored; see CLAUDE.local.md for what to put in it
//   3. nothing, in which case the script says what to set and exits
//
// Shape of scripts/local-corpus.js:
//
//   module.exports = {
//       solution:       'X:\\path\\to\\Solution.sln',
//       clarionRoot:    'X:\\path\\to\\ClarionNN',
//       clarionVersion: 'TheNameInClarionProperties.xml',
//       bigFile:        'X:\\path\\to\\a\\large\\generated.clw',
//       linkFile:       'X:\\path\\to\\a\\file\\with\\INCLUDE\\directives.clw',
//   };
'use strict';

let local = {};
try {
    local = require('./local-corpus');
} catch {
    // absent is fine — the environment may supply everything
}

const values = {
    solution: process.env.CLARION_TEST_SLN || local.solution,
    clarionRoot: process.env.CLARION_TEST_CLARION_ROOT || local.clarionRoot,
    clarionVersion: process.env.CLARION_TEST_VERSION || local.clarionVersion,
    bigFile: process.env.CLARION_TEST_FILE || local.bigFile,
    linkFile: process.env.CLARION_TEST_LINK_FILE || local.linkFile,
};

const ENV_OF = {
    solution: 'CLARION_TEST_SLN',
    clarionRoot: 'CLARION_TEST_CLARION_ROOT',
    clarionVersion: 'CLARION_TEST_VERSION',
    bigFile: 'CLARION_TEST_FILE',
    linkFile: 'CLARION_TEST_LINK_FILE',
};

/** The configured value, or a clear exit explaining how to configure it. */
function required(name) {
    const value = values[name];
    if (value) return value;
    console.error(
        `\nNo test corpus configured for "${name}".\n` +
        `Set ${ENV_OF[name]}, or create scripts/local-corpus.js (gitignored) exporting it.\n` +
        `See CLAUDE.local.md. Nothing identifying the corpus may be committed.\n`
    );
    process.exit(2);
}

/** The configured value, or undefined — for callers that can carry on without it. */
function optional(name) {
    return values[name];
}

module.exports = { required, optional };
