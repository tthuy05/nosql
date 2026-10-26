// Compatibility entrypoint: the old harness used FLUSHDB and only checked
// prerequisites for UI/restore. Actual checks now use an owned test environment.
require('./acceptance_runner');
