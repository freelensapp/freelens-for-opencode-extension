type LaunchCommandBuilder = (workdir: string) => string;

function quoteWindowsDoubleQuotedLiteral(value: string): string {
  return value.replace(/[`"$]/g, "`$&");
}

function quotePosixDoubleQuotedLiteral(value: string): string {
  return value.replace(/["\\$`]/g, "\\$&");
}

function getWindowsLaunchCommand(workdir: string): string {
  return `Set-Location -LiteralPath "${quoteWindowsDoubleQuotedLiteral(workdir)}" -ErrorAction Stop ; $fullPath = $env:Path ; Remove-Item Env:Path -ErrorAction SilentlyContinue ; [Environment]::SetEnvironmentVariable("Path", $fullPath, "Process") ; opencode`;
}

function getPosixLaunchCommand(workdir: string): string {
  return `cd "${quotePosixDoubleQuotedLiteral(workdir)}" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" opencode`;
}

const launchCommandBuilders: Record<NodeJS.Platform, LaunchCommandBuilder> = {
  aix: getPosixLaunchCommand,
  android: getPosixLaunchCommand,
  cygwin: getPosixLaunchCommand,
  darwin: getPosixLaunchCommand,
  freebsd: getPosixLaunchCommand,
  haiku: getPosixLaunchCommand,
  linux: getPosixLaunchCommand,
  netbsd: getPosixLaunchCommand,
  openbsd: getPosixLaunchCommand,
  sunos: getPosixLaunchCommand,
  win32: getWindowsLaunchCommand,
};

export function getLaunchCommand(workdir: string, platform: NodeJS.Platform): string {
  return launchCommandBuilders[platform](workdir);
}
