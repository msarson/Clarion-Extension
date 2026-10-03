/**
 * #637 - a `SELF.member` lookup the way hover, Go to Definition and Go to Implementation ask it
 * since #626: name SELF's class with resolveEnclosingClassName (#622), then ask
 * MemberLocatorService.findMemberInClass. Tests that pinned ClassMemberResolver.findClassMemberInfo
 * (retired in #637) assert through this instead, so they pin the code that actually runs.
 */
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../../TokenCache';
import { MemberLocatorService } from '../../services/MemberLocatorService';
import { resolveEnclosingClassName } from '../../utils/EnclosingClassResolver';
import type { MemberInfo } from '../../utils/ClassMemberScan';

export async function selfMemberAt(
    document: TextDocument,
    line: number,
    member: string,
    paramCount?: number
): Promise<MemberInfo | null> {
    const tokenCache = TokenCache.getInstance();
    tokenCache.getTokens(document);
    const className = resolveEnclosingClassName(document, line, tokenCache.getStructure(document));
    // With the line, as the providers ask since #650: the nearest same-named local CLASS.
    return className ? new MemberLocatorService().findMemberInClass(className, member, document, paramCount, line) : null;
}
