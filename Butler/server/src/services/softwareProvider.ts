import { spawnSync } from 'node:child_process';

export interface SoftwareUninstallOutcome {
  exitCode: number;
  output: string;
}

export interface SoftwareProvider {
  isInstalled(packageId: string): boolean;
  uninstall(packageId: string): SoftwareUninstallOutcome;
}

export class WingetSoftwareProvider implements SoftwareProvider {
  isInstalled(packageId: string): boolean {
    const result = runWinget(['list', '--id', packageId, '--exact', '--accept-source-agreements', '--disable-interactivity']);
    if (result.exitCode !== 0) return false;
    const escaped = packageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'mi').test(result.output);
  }

  uninstall(packageId: string): SoftwareUninstallOutcome {
    return runWinget([
      'uninstall', '--id', packageId, '--exact', '--silent',
      '--accept-source-agreements', '--disable-interactivity',
    ]);
  }
}

function runWinget(args: string[]): SoftwareUninstallOutcome {
  const result = spawnSync('winget', args, {
    encoding: 'utf-8',
    windowsHide: true,
    timeout: 120_000,
    shell: false,
  });
  return {
    exitCode: result.status ?? (result.error ? -1 : 0),
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}

let provider: SoftwareProvider = new WingetSoftwareProvider();

export function getSoftwareProvider(): SoftwareProvider {
  return provider;
}

export function setSoftwareProvider(next: SoftwareProvider): void {
  provider = next;
}
