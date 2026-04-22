export class AuthRequiredError extends Error {
  constructor(msg?: string) {
    super(msg ?? 'auth required')
    this.name = 'AuthRequiredError'
  }
}
