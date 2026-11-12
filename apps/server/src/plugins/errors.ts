export class PluginInstallError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(
    message: string,
    statusCode = 400,
    code = "plugin_install_error",
  ) {
    super(message);
    this.name = "PluginInstallError";
    this.statusCode = statusCode;
    this.code = code;
  }
}
