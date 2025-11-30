# Test Programs

This directory contains Clarion test programs used for development and validation.

## Structure

### syntax-tests/
Comprehensive syntax tests for Clarion language features.

- **TEST_CLARION_SYNTAX.clw** - Original test program with 20 test procedures
- **TEST_CLARION_SYNTAX_FIXED.clw** - Fixed version with all syntax errors corrected
- **TEST_CLARION_SYNTAX_SPEC.md** - Detailed specification and validation of each test

These files test:
- Dot (.) as structure terminator
- IF/ELSIF/ELSE structures
- LOOP and CASE statements
- GROUP declarations
- Semicolon usage
- ROUTINE implementations
- Column 0 rules

**Status:** ✓ All files compile successfully with Clarion compiler

### Root Test Files
Other test Clarion files for specific feature testing:
- test_comprehensive_prefix.clw
- test_example.clw
- test_goto_fix.clw
- test_map.clw
- test_module.clw
- test_proper_structure.clw
- test_structure_prefix.clw
