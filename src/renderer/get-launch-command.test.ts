import { describe, expect, it } from "vitest";
import { getLaunchCommand } from "./get-launch-command";

describe("getLaunchCommand", () => {
  it("normalizes Windows Path before starting opencode", () => {
    const command = getLaunchCommand(
      "C:\\Users\\lcapuano\\AppData\\Roaming\\Freelens\\opencode-sessions\\cluster-1",
      "win32",
    );

    expect(command).toBe(
      'Set-Location -LiteralPath "C:\\Users\\lcapuano\\AppData\\Roaming\\Freelens\\opencode-sessions\\cluster-1" -ErrorAction Stop ; $fullPath = $env:Path ; Remove-Item Env:Path -ErrorAction SilentlyContinue ; [Environment]::SetEnvironmentVariable("Path", $fullPath, "Process") ; opencode',
    );
  });

  it("quotes Windows workdirs literally", () => {
    const command = getLaunchCommand("C:\\Users\\$name\\`temp", "win32");

    expect(command).toBe(
      'Set-Location -LiteralPath "C:\\Users\\`$name\\``temp" -ErrorAction Stop ; $fullPath = $env:Path ; Remove-Item Env:Path -ErrorAction SilentlyContinue ; [Environment]::SetEnvironmentVariable("Path", $fullPath, "Process") ; opencode',
    );
  });

  it("uses LiteralPath for Windows wildcard workdirs", () => {
    const command = getLaunchCommand("C:\\Users\\name[1]\\opencode-sessions\\cluster-*", "win32");

    expect(command).toBe(
      'Set-Location -LiteralPath "C:\\Users\\name[1]\\opencode-sessions\\cluster-*" -ErrorAction Stop ; $fullPath = $env:Path ; Remove-Item Env:Path -ErrorAction SilentlyContinue ; [Environment]::SetEnvironmentVariable("Path", $fullPath, "Process") ; opencode',
    );
  });

  it("uses the POSIX launch command on every non-Windows Node platform", () => {
    const posixPlatforms: NodeJS.Platform[] = [
      "aix",
      "android",
      "cygwin",
      "darwin",
      "freebsd",
      "haiku",
      "linux",
      "netbsd",
      "openbsd",
      "sunos",
    ];

    for (const platform of posixPlatforms) {
      expect(getLaunchCommand("/tmp/opencode-sessions/cluster-1", platform)).toBe(
        'cd "/tmp/opencode-sessions/cluster-1" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" opencode',
      );
    }
  });

  it("quotes POSIX workdirs literally", () => {
    const command = getLaunchCommand('/tmp/$USER/`touch`/$(echo pwn)/"quote"/slash\\dir', "linux");

    expect(command).toBe(
      'cd "/tmp/\\$USER/\\`touch\\`/\\$(echo pwn)/\\"quote\\"/slash\\\\dir" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" opencode',
    );
  });
});
