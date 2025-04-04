# Server Managers

This directory contains manager classes that handle different aspects of the Clarion Extension server functionality. The refactoring was done to improve code organization, maintainability, and testability.

## Manager Classes

### ServerConnectionManager

Handles the connection between the server and client.

- Creates and manages the connection
- Sets up error handlers
- Handles initialization events
- Manages server readiness state

### ServerDocumentManager

Manages document-related operations.

- Handles document events (open, close, change, save)
- Tracks document state
- Filters XML files

### TokenManager

Manages token caching and retrieval.

- Gets tokens for documents
- Manages token cache
- Handles debounced token refresh

### ProviderManager

Manages language feature providers.

- Document symbols
- Folding ranges
- Document formatting
- Color provider
- Definition provider

### RequestHandler

Handles client requests and notifications.

- Solution tree requests
- File finding requests
- Search path requests
- Source file management requests
- Redirection files requests
- Path update notifications

## Usage

Each manager class follows the singleton pattern and can be accessed using its respective getter function:

```typescript
import { getServerConnectionManager } from './managers/ServerConnectionManager';
import { getServerDocumentManager } from './managers/ServerDocumentManager';
import { getTokenManager } from './managers/TokenManager';
import { getProviderManager } from './managers/ProviderManager';
import { getRequestHandler } from './managers/RequestHandler';

// Get manager instances
const serverConnectionManager = getServerConnectionManager();
const serverDocumentManager = getServerDocumentManager();
const tokenManager = getTokenManager();
const providerManager = getProviderManager();
const requestHandler = getRequestHandler();

// Use manager methods
const connection = serverConnectionManager.getConnection();
const document = serverDocumentManager.getDocument(uri);
const tokens = tokenManager.getTokens(document);
```

## Benefits

1. **Improved Code Organization**: Each manager has a clear, focused responsibility.
2. **Better Maintainability**: Smaller, more focused files are easier to understand and modify.
3. **Enhanced Testability**: Manager classes can be tested in isolation.
4. **Reduced Complexity**: The main server.ts file is now much simpler and easier to understand.
5. **Easier Extension**: New functionality can be added by extending existing managers or creating new ones.