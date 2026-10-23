export class HostSignerUnavailableError extends Error {
  constructor(detail: string) {
    super(`Host signer unavailable: ${detail}`);
    this.name = "HostSignerUnavailableError";
  }
}
