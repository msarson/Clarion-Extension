const includePattern = /INCLUDE\s*\(\s*'([^']+\.[a-zA-Z0-9]+)'\s*(?:,\s*'([^']+?)'\s*)?(?:,\s*ONCE)?\)/ig;

const test1 = "  INCLUDE('KEYCODES.CLW')";
const test2 = "  INCLUDE('CBCodeParse.INC'),ONCE";
const test3 = "  INCLUDE('ATSort_DATA.clw','GLOBAL DATA')";

console.log('Test 1:', test1);
console.log('Match:', includePattern.exec(test1));
includePattern.lastIndex = 0;

console.log('\nTest 2:', test2);
console.log('Match:', includePattern.exec(test2));
includePattern.lastIndex = 0;

console.log('\nTest 3:', test3);
console.log('Match:', includePattern.exec(test3));
