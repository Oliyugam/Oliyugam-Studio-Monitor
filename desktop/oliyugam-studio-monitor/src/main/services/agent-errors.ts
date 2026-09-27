export abstract class AgentError extends Error {
  readonly code: string;

  protected constructor(name: string, code: string, message: string) {
    super(message);
    this.name = name;
    this.code = code;
  }
}

export class AuthenticationError extends AgentError {
  constructor() {
    super("AuthenticationError", "AUTHENTICATION_REQUIRED", "Sign-in is unavailable.");
  }
}

export class DeviceEnrollmentError extends AgentError {
  constructor() {
    super("DeviceEnrollmentError", "DEVICE_ENROLLMENT_FAILED", "Device registration is unavailable.");
  }
}

export class NetworkError extends AgentError {
  constructor() {
    super("NetworkError", "NETWORK_UNAVAILABLE", "The network is unavailable.");
  }
}

export class ServerError extends AgentError {
  constructor() {
    super("ServerError", "SERVER_ERROR", "The service is temporarily unavailable.");
  }
}

export class ValidationError extends AgentError {
  constructor(message = "That action is not available right now.") {
    super("ValidationError", "VALIDATION_ERROR", message);
  }
}

export class SyncError extends AgentError {
  constructor() {
    super("SyncError", "SYNC_FAILED", "Some data is waiting to sync.");
  }
}

export class DatabaseError extends AgentError {
  constructor() {
    super("DatabaseError", "DATABASE_ERROR", "Local data could not be saved.");
  }
}

export class ConfigurationError extends AgentError {
  constructor() {
    super("ConfigurationError", "CONFIGURATION_INVALID", "This device needs to be configured.");
  }
}