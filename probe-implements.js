// Probe: test handleImplementsHover logic
const line = "StandardBehavior CLASS,IMPLEMENTS(BrowseQueue),IMPLEMENTS(IListControl),TYPE,MODULE('ABBROWSE.CLW'),DLL(_ABCDllMode_)";

const bqStart = line.indexOf('BrowseQueue');
console.log('Line:', line);
console.log('BrowseQueue starts at col:', bqStart);

const implementsRe = /\bIMPLEMENTS\s*\(\s*(\w+)\s*\)/gi;
let match;
while ((match = implementsRe.exec(line)) !== null) {
    const ifaceName = match[1];
    const nameStart = match.index + match[0].indexOf(ifaceName);
    const nameEnd = nameStart + ifaceName.length;
    console.log('IMPLEMENTS match:', ifaceName, 'span', nameStart, '-', nameEnd,
        '| cursor@' + bqStart + ' hits?', bqStart >= nameStart && bqStart <= nameEnd);
}

// Also check what 'word' the hover system would extract at bqStart
// VS Code word extraction uses \w+ boundaries
const wordRe = /\w+/g;
let wm;
while ((wm = wordRe.exec(line)) !== null) {
    if (wm.index <= bqStart && bqStart < wm.index + wm[0].length) {
        console.log('Word at cursor:', wm[0], 'start:', wm.index);
    }
}
