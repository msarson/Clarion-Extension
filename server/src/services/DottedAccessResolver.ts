/**
 * #638 (#609 phase 4) — what `receiver.member` refers to, answered once for every feature that asks.
 *
 * Hover (StructureFieldResolver / MethodHoverResolver) and Go to Definition each walked the same
 * steps for a member access: name the receiver's class, find the member in it, then let the call's
 * argument types pick among overloads. They did it in parallel code kept "symmetric" by hand, and
 * differed in the details (which class the argument-type pick ran on, how a chain's root was read).
 * Phase 3 made the pieces shared (resolveEnclosingClassName #622, resolveParentClassAt #648,
 * resolveReceiverClass #611, findMemberInClass with the line #650); this composes them, so the
 * features get the declaration from one call and cannot disagree about it.
 *
 *  - #651: a single-level receiver that names a class - SELF, PARENT, or a CLASS or a variable of a
 *    CLASS type.
 *  - #652: a chain (`SELF.a.b`, `obj.a.b`), walked by ChainedPropertyResolver from a root read the
 *    same way, through inline GROUP / QUEUE / RECORD members of a class body (#552).
 *
 *  - #652: a receiver that names no class - a GROUP / QUEUE by its own label, or a variable of a
 *    GROUP / QUEUE / interface type.
 *
 * The colon forms (#653) return null for now and callers keep their own paths.
 */
import { Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from './MemberLocatorService';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { ChainedPropertyResolver } from '../utils/ChainedPropertyResolver';
import type { MemberInfo } from '../utils/ClassMemberScan';

export type ReceiverKind = 'self' | 'parent' | 'object' | 'chain' | 'structure' | 'interface';

export interface DottedMember {
    /** How the receiver was read. */
    receiverKind: ReceiverKind;
    /** The class whose member was asked for: SELF's, PARENT's, the object's, or the chain's last. */
    receiverClass: string;
    /**
     * The declaration the access names. `className` is the class that declares it (an ancestor
     * of `receiverClass` when inherited); `line`/`file`/`signature` are the overload the call's
     * argument types picked, when they picked one.
     */
    member: MemberInfo;
    /** The picked overload's prototype, when the argument types picked one. */
    pickedSignature?: string;
}

/** A receiver the chain walk accepts: dot-separated identifiers, colons allowed in each. */
const CHAIN = /^[A-Za-z_][\w:]*(?:\.[A-Za-z_][\w:]*)+$/;

export class DottedAccessResolver {
    private tokenCache = TokenCache.getInstance();
    private chains = new ChainedPropertyResolver();

    constructor(
        private memberLocator: MemberLocatorService = new MemberLocatorService(),
        private overloadResolver: MethodOverloadResolver = new MethodOverloadResolver()
    ) {}

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
        let kind: ReceiverKind;
        let className: string;
        let member: MemberInfo | null;

        if (CHAIN.test(receiver)) {
            const position: Position = { line, character: 0 };
            const owner = await this.chains.resolveFinalOwner(receiver, document, position);
            if (!owner) return null;
            kind = 'chain';
            if (owner.kind === 'inline') {
                // #552: a field of an inline structure in a class body - no class, no overloads.
                const field = await this.chains.resolve(receiver, memberName, document, position, paramCount);
                return field ? { receiverKind: kind, receiverClass: owner.className, member: field } : null;
            }
            className = owner.name;
            member = await this.memberLocator.findMemberInClass(className, memberName, document, paramCount);
        } else {
            const r = await this.memberLocator.resolveReceiverAt(receiver, document, line);
            if (r) {
                kind = r.kind;
                className = r.className;
                member = await this.memberLocator.findMemberInClass(className, memberName, document, paramCount, r.atLine);
            } else {
                // #652: a receiver that names no class - a GROUP / QUEUE by its own label, or a
                // variable of a GROUP / QUEUE / interface type.
                const s = await this.resolveStructureMember(receiver, memberName, document, line, paramCount);
                if (!s) return null;
                kind = s.kind;
                className = s.className;
                member = s.member;
            }
        }

        // #182 / #252: the call's argument types pick among same-arity overloads. Asked of the
        // class that declares the member when it was found (an inherited overload lives there),
        // else of the receiver's class (#651).
        let pickedSignature: string | undefined;
        if (paramCount !== undefined) {
            const tokens = this.tokenCache.getTokens(document);
            const picked = await this.overloadResolver.resolveOverloadDeclByArgs(
                member?.className ?? className, memberName, document, tokens, line);
            if (picked) {
                member = {
                    ...(member ?? { type: 'PROCEDURE', className }),
                    line: picked.line, file: picked.file, signature: picked.signature,
                };
                pickedSignature = picked.signature;
            }
        }
        return member ? { receiverKind: kind, receiverClass: className, member, pickedSignature } : null;
    }

    /**
     * #652 — the member of a receiver that is no class: a GROUP / QUEUE declared with that label
     * (its own fields, and those it takes from a type argument), or a variable of a GROUP / QUEUE
     * type, or a reference to an interface. Null when the receiver is none of these.
     */
    private async resolveStructureMember(
        receiver: string,
        memberName: string,
        document: TextDocument,
        line: number,
        paramCount: number | undefined
    ): Promise<{ kind: ReceiverKind; className: string; member: MemberInfo | null } | null> {
        if (!/^[A-Za-z_][\w:]*$/.test(receiver)) return null;
        const byLabel = await this.memberLocator.findMemberInClass(receiver, memberName, document, paramCount, line);
        if (byLabel) return { kind: 'structure', className: receiver, member: byLabel };

        const tokens = this.tokenCache.getTokens(document);
        const typed = await this.memberLocator.resolveVariableType(receiver, tokens, document, line);
        if (!typed) return null;
        if (typed.isReference) {
            const viaInterface = await this.memberLocator.findMemberInInterface(typed.typeName, memberName, document, paramCount);
            if (viaInterface) return { kind: 'interface', className: typed.typeName, member: viaInterface };
        }
        const viaType = await this.memberLocator.findMemberInClass(typed.typeName, memberName, document, paramCount);
        return viaType ? { kind: 'structure', className: typed.typeName, member: viaType } : null;
    }
}
