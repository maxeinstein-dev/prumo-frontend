// Imported first by main.tsx: moves the keys saved under the old name before any module reads the session.
import { browserStorage, renameStoredKeys } from './utils/storageRename';

renameStoredKeys(browserStorage());
