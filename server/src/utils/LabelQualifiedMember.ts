import { Token, TokenType } from '../tokenizer/TokenTypes';
import { structuresWithLabel } from './TokenIndexes';
import { findInLineRange } from './TokenLineIndex';

/**
 * #610 - `StructureLabel:Member`, the colon form of Field Qualification.
 *
 * Language Reference > 2 > Field Qualification: a member of any complex structure may be
 * referenced as StructureName.FieldLabel, and "you may use a colon (:) instead of a period
 * (StructureName:FieldLabel) to reference member variables of any structure except CLASS";
 * the RECORD label of a FILE may be omitted. So `Customer:Record` is the RECORD of FILE
 * Customer and `Customer:Name` a field of it - whatever the FILE's PRE() says.
 *
 * Resolvers try the PRE() form first and call this when no structure carries that prefix.
 * Returns null unless the member is really declared in that structure, so a standalone label
 * that merely contains a colon (`Loc:Count LONG`) is never claimed.
 */
export function findLabelQualifiedMember(
    tokens: Token[],
    structureLabel: string,
    memberName: string
): { structure: Token; member: Token } | null {
    const labelUpper = structureLabel.toUpperCase();
    const memberUpper = memberName.toUpperCase();

    // #711 — structures by label, and the member search inside the structure's own lines only.
    const structure = structuresWithLabel(tokens, structureLabel).find(t =>
        t.type === TokenType.Structure &&
        t.label?.toUpperCase() === labelUpper &&
        !/^(CLASS|INTERFACE)$/i.test(t.value)
    );
    if (!structure) return null;

    const member = findInLineRange(tokens, structure.line + 1, structure.finishesAt ?? Number.MAX_SAFE_INTEGER, t => {
        if (t.type === TokenType.Label && t.start === 0 && t.value.toUpperCase() === memberUpper) return true;
        return t.type === TokenType.Structure && t.label?.toUpperCase() === memberUpper;
    });
    return member ? { structure, member } : null;
}
