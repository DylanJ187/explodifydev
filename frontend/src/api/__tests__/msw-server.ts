import { setupServer } from 'msw/node'

// Handlers are added per-test via server.use(...).
// The server singleton is consumed by test-setup.ts for lifecycle management.
export const server = setupServer()
