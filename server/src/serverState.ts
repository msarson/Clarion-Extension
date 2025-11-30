/**
 * Server state flags
 * Separate module to avoid circular dependencies
 */

export let serverInitialized = false;

export function setServerInitialized(value: boolean): void {
    serverInitialized = value;
}
