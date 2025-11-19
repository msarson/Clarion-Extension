import * as vscode from 'vscode';
import * as appInsights from 'applicationinsights';

const CONNECTION_STRING = 'InstrumentationKey=354df8da-03aa-4107-b8e0-7f2c8d1b16e5;IngestionEndpoint=https://uksouth-1.in.applicationinsights.azure.com/;LiveEndpoint=https://uksouth.livediagnostics.monitor.azure.com/;ApplicationId=e26c7c3a-9981-4baf-8975-abcb1c572906';

let telemetryClient: appInsights.TelemetryClient | undefined;

export async function initializeTelemetry(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('clarion');
    const telemetryEnabled = config.get<boolean>('telemetry.enabled', true);

    if (!telemetryEnabled) {
        console.log('[Clarion] Telemetry disabled by user');
        return;
    }

    try {
        appInsights.setup(CONNECTION_STRING)
            .setAutoCollectConsole(false)
            .setAutoCollectRequests(false)
            .setAutoCollectPerformance(true, false)
            .setAutoCollectExceptions(true)
            .setAutoCollectDependencies(false)
            .setUseDiskRetryCaching(true)
            .start();

        telemetryClient = appInsights.defaultClient;

        // Add common properties to all telemetry events
        telemetryClient.commonProperties = {
            extensionVersion: context.extension.packageJSON.version,
            vscodeVersion: vscode.version,
            platform: process.platform,
            nodeVersion: process.version
        };

        // Track activation
        trackEvent('ExtensionActivated');

        // Flush telemetry on deactivation
        context.subscriptions.push({
            dispose: () => {
                if (telemetryClient) {
                    telemetryClient.flush();
                }
            }
        });

        console.log('[Clarion] Telemetry initialized');
    } catch (error) {
        console.error('[Clarion] Failed to initialize telemetry:', error);
    }
}

export function trackEvent(eventName: string, properties?: { [key: string]: string }, measurements?: { [key: string]: number }): void {
    if (telemetryClient) {
        telemetryClient.trackEvent({
            name: eventName,
            properties,
            measurements
        });
    }
}

export function trackException(error: Error, properties?: { [key: string]: string }): void {
    if (telemetryClient) {
        telemetryClient.trackException({
            exception: error,
            properties
        });
    }
}

export function trackMetric(name: string, value: number, properties?: { [key: string]: string }): void {
    if (telemetryClient) {
        telemetryClient.trackMetric({
            name,
            value,
            properties
        });
    }
}
