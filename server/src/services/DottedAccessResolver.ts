/**
 * #638 / #651 (#609 phase 4) — what `receiver.member` refers to, answered once for every
 * feature that asks.
 *
 * Hover (StructureFieldResolver / MethodHoverResolver) and Go to Definition each walked the same
 * three steps for `SELF.x`, `PARENT.x` and `obj.x`: name the receiver's class, find the member in
 * it, then let the call's argument types pick among overloads. They did it in parallel code kept
 * "symmetric" by hand, and differed in the details (which class the argument-type pick ran on,
 * whether it ran before or after the member lookup). Phase 3 made the pieces shared
 * (resolveEnclosingClassName #622, resolveParentClassAt #648, resolveReceiverClass #611,
 * findMemberInClass with the line #650); this composes them, so the features get the declaration
 * from one call and cannot disagree about it.
 *
 * Step 1 (#651) covers a single-level receiver that names a class: SELF, PARENT, or a name that is a
 * CLASS or a variable of a CLASS type. Chains, GROUP/QUEUE fields, interfaces and the colon forms
 * are steps 2 and 3 (#652, #653); for those `resolve` returns null and callers keep their own paths.
 */
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from './MemberLocatorService';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { resolveEnclosingClassName } from '../utils/EnclosingClassResolver';
import type { MemberInfo } from '../utils/ClassMemberScan';

export type ReceiverKind = 'self' | 'parent' | 'object';

export interface DottedMember {
    /** How the receiver was read. */
    receiverKind: ReceiverKind;
    /** The receiver's class: SELF's class, PARENT's class, or the object's class. */
    receiverClass: string;
    /**
     * The declaration the access names. `className` is the class that declares it (an ancestor
     * of `receiverClass` when inherited); `line`/`file` are the overload the call's argument
     * types picked, when they picked one.
     */
    member: MemberInfo;
    /** The picked overload's prototype, when the argument types picked one. */
    pickedSignature?: string;
}

export class DottedAccessResolver {
    private tokenCache = TokenCache.getInstance();

    constructor(
        private memberLocator: MemberLocatorService = new MemberLocatorService(),
        private overloadResolver: MethodOverloadResolver = new MethodOverloadResolver()
    ) {}

    /**
     * The class a single-level receiver names at `line`, and the line to hand the member lookup
     * (#650: SELF and an explicit local CLASS pick the nearest same-named declaration; PARENT's
     * class is not a duplicated local label). Null for anything this step does not cover.
     */
    async resolveReceiver(
        receiver: string,
        document: TextDocument,
        line: number
    ): Promise<{ kind: ReceiverKind; className: string; atLine?: number } | null> {
        if (!/^[A-Za-z_][\w:]*$/.test(receiver)) return null; // a chain or an expression: not step 1
        if (/^self$/i.test(receiver)) {
            const className = resolveEnclosingClassName(document, line, this.tokenCache.getStructure(document));
            return className ? { kind: 'self', className, atLine: line } : null;
        }
        if (/^parent$/i.test(receiver)) {
            const parent = await this.memberLocator.resolveParentClassAt(document, line);
            return parent ? { kind: 'parent', className: parent.parentClassName } : null;
        }
        const tokens = this.tokenCache.getTokens(document);
        const cls = await this.memberLocator.resolveReceiverClass(receiver, tokens, document, line);
        return cls ? { kind: 'object', className: cls.className, atLine: line } : null;
    }

    /**
     * The declaration `receiver.memberName` names at `line`. `paramCount` is the call's argument
     * count, or undefined for an access without parentheses (no overload to pick).
     */
    async resolve(
        receiver: string,
        memberName: string,
        document: TextDocument,
        line: number,
        paramCount: number | undefined
    ): Promise<DottedMember | null> {
        const r = await this.resolveReceiver(receiver, document, line);
        if (!r) return null;

        let member = await this.memberLocator.findMemberInClass(r.className, memberName, document, paramCount, r.atLine);
        let pickedSignature: string | undefined;

        // #182 / #252: the call's argument types pick among same-arity overloads. Asked of the
        // class that declares the member when it was found (an inherited overload lives there),
        // else of the receiver's class.
        if (paramCount !== undefined) {
            const tokens = this.tokenCache.getTokens(document);
            const picked = await this.overloadResolver.resolveOverloadDeclByArgs(
                member?.className ?? r.className, memberName, document, tokens, line);
            if (picked) {
                member = {
                    ...(member ?? { type: 'PROCEDURE', className: r.className }),
                    line: picked.line, file: picked.file, signature: picked.signature,
                };
                pickedSignature = picked.signature;
            }
        }
        return member ? { receiverKind: r.kind, receiverClass: r.className, member, pickedSignature } : null;
    }
}
