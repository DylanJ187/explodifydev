import '@testing-library/jest-dom'
import { server } from './api/__tests__/msw-server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
