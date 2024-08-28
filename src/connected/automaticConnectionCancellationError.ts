export class AutomaticConnectionSetupCancellationError extends Error {
	constructor(message: string) {
	  super(message);
	  this.name = "AutomaticConnectionSetupCancellationError";
	}
}