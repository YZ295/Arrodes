param(
  [Parameter(Mandatory = $true)][string]$Op,
  [string]$Payload = '{}'
)

$ErrorActionPreference = 'Stop'

function Write-Result($obj) {
  $obj | ConvertTo-Json -Compress -Depth 8
}

function Invoke-Key([byte]$vk) {
  Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public static class ArrodesKeyInject {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);
  public static void Press(byte vk) {
    keybd_event(vk, 0, 0, System.UIntPtr.Zero);
    keybd_event(vk, 0, 2, System.UIntPtr.Zero);
  }
}
"@ -ErrorAction SilentlyContinue
  [ArrodesKeyInject]::Press($vk)
}

function Set-VolumePercent([int]$percent) {
  if ($percent -lt 0) { $percent = 0 }
  if ($percent -gt 100) { $percent = 100 }
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IArrodesAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr p);
  int UnregisterControlChangeNotify(IntPtr p);
  int GetChannelCount(out UInt32 count);
  int SetMasterVolumeLevel(Single level, Guid context);
  int SetMasterVolumeLevelScalar(Single level, Guid context);
  int GetMasterVolumeLevel(out Single level);
  int GetMasterVolumeLevelScalar(out Single level);
  int SetChannelVolumeLevel(UInt32 channel, Single level, Guid context);
  int SetChannelVolumeLevelScalar(UInt32 channel, Single level, Guid context);
  int GetChannelVolumeLevel(UInt32 channel, out Single level);
  int GetChannelVolumeLevelScalar(UInt32 channel, out Single level);
  int SetMute(Boolean mute, Guid context);
  int GetMute(out Boolean mute);
}
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class ArrodesMMDeviceEnumeratorComObject { }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IArrodesMMDeviceEnumerator {
  int EnumAudioEndpoints(Int32 dataFlow, Int32 stateMask, out IArrodesMMDevice device);
  int GetDefaultAudioEndpoint(Int32 dataFlow, Int32 role, out IArrodesMMDevice device);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IArrodesMMDevice {
  int Activate(ref Guid id, Int32 clsCtx, IntPtr activationParams, out IArrodesAudioEndpointVolume aev);
}
public static class ArrodesVolCtrl {
  public static void Set(int percent) {
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    Type t = Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"));
    object enumerator = Activator.CreateInstance(t);
    IArrodesMMDeviceEnumerator devEnum = (IArrodesMMDeviceEnumerator)enumerator;
    IArrodesMMDevice device;
    devEnum.GetDefaultAudioEndpoint(0, 1, out device);
    Guid iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    IArrodesAudioEndpointVolume vol;
    device.Activate(ref iid, 1, IntPtr.Zero, out vol);
    vol.SetMasterVolumeLevelScalar((Single)(percent / 100.0), Guid.Empty);
  }
}
"@ -ErrorAction SilentlyContinue
  [ArrodesVolCtrl]::Set($percent)
}

try {
  # Unified payload parse: object JSON or plain string
  $P = $null
  try { $P = $Payload | ConvertFrom-Json -ErrorAction Stop } catch { $P = $Payload }

  switch ($Op) {
    'open-app' {
      $target = [string]$P
      if ([string]::IsNullOrWhiteSpace($target)) { throw 'Open target is empty' }
      if ($target -match '^(https?|mailto|file):') {
        Start-Process $target
        Write-Result @{ ok = $true; data = @{ detail = "opened: $target" } }
      } elseif ($target -match '\.(exe|bat|cmd|lnk|com)$' -or $target -match '[\\/]') {
        if (-not (Test-Path $target)) { throw "path not found: $target" }
        Start-Process -FilePath $target
        Write-Result @{ ok = $true; data = @{ detail = "started: $target" } }
      } else {
        $cmd = Get-Command $target -ErrorAction SilentlyContinue
        if ($cmd) {
          Start-Process -FilePath $cmd.Source
          Write-Result @{ ok = $true; data = @{ detail = "started: $target" } }
        } else {
          $map = @{
            'notepad' = 'notepad'; 'calc' = 'calc'; 'mspaint' = 'mspaint'
            'cmd' = 'cmd'; 'powershell' = 'powershell'; 'wt' = 'wt'
            'explorer' = 'explorer'; 'chrome' = 'chrome'; 'msedge' = 'msedge'
            'wechat' = 'wechat'; 'code' = 'code'; 'cloudmusic' = 'cloudmusic'
            'steam' = 'steam'
          }
          $app = $map[$target.ToLower()]
          if (-not $app) { throw "app not found: $target. Provide full path, exe name or URL." }
          $resolved = Get-Command $app -ErrorAction SilentlyContinue
          if ($resolved) { Start-Process -FilePath $resolved.Source }
          else { Start-Process -FilePath $app -ErrorAction Stop }
          Write-Result @{ ok = $true; data = @{ detail = "started: $target" } }
        }
      }
    }

    'list-windows' {
      $windows = Get-Process | Where-Object {
        $_.MainWindowHandle -ne 0 -and -not [string]::IsNullOrWhiteSpace($_.MainWindowTitle)
      } | Select-Object -First 50 @{n = 'pid'; e = { $_.Id } }, @{n = 'process'; e = { $_.ProcessName } }, @{n = 'title'; e = { $_.MainWindowTitle } }
      Write-Result @{ ok = $true; data = @{ windows = @($windows) } }
    }

    'focus-window' {
      $wsh = New-Object -ComObject WScript.Shell
      $focused = $false
      if ($null -ne $P -and $null -ne $P.pid) {
        $focused = $wsh.AppActivate([int]$P.pid)
      } elseif ($null -ne $P -and $null -ne $P.title -and -not [string]::IsNullOrWhiteSpace([string]$P.title)) {
        $focused = $wsh.AppActivate([string]$P.title)
      }
      if (-not $focused) { throw "window not found (pid=$($P.pid) title=$($P.title))" }
      Write-Result @{ ok = $true; data = @{ detail = 'window focused' } }
    }

    'close-window' {
      $proc = $null
      if ($null -ne $P -and $null -ne $P.pid) {
        $proc = Get-Process -Id ([int]$P.pid) -ErrorAction SilentlyContinue
      } elseif ($null -ne $P -and $null -ne $P.process) {
        $proc = Get-Process -Name ([string]$P.process) -ErrorAction SilentlyContinue |
          Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
      }
      if ($null -eq $proc) { throw 'no window to close' }
      [void]$proc.CloseMainWindow()
      Write-Result @{ ok = $true; data = @{ detail = "close requested: $($proc.ProcessName) (pid=$($proc.Id))" } }
    }

    'type-text' {
      $text = [string]$P.text
      $prev = $null
      try { $prev = Get-Clipboard -Raw -ErrorAction Stop } catch { $prev = $null }
      Set-Clipboard -Value $text
      $wsh = New-Object -ComObject WScript.Shell
      Start-Sleep -Milliseconds 150
      $wsh.SendKeys('^v')
      Start-Sleep -Milliseconds 150
      if ($null -ne $prev) { Set-Clipboard -Value $prev }
      Write-Result @{ ok = $true; data = @{ detail = "typed $($text.Length) chars" } }
    }

    'send-hotkey' {
      $keys = [string]$P
      if ([string]::IsNullOrWhiteSpace($keys)) { throw 'hotkey is empty' }
      $wsh = New-Object -ComObject WScript.Shell
      $wsh.SendKeys($keys)
      Write-Result @{ ok = $true; data = @{ detail = "hotkey sent: $keys" } }
    }

    'volume' {
      $action = [string]$P.action
      switch ($action) {
        'up' { Invoke-Key 0xAF }
        'down' { Invoke-Key 0xAE }
        'mute' { Invoke-Key 0xAD }
        'set' {
          $value = 0
          if (-not [int]::TryParse([string]$P.value, [ref]$value)) { throw 'volume value must be a number (0-100)' }
          Set-VolumePercent $value
        }
        default { throw "unknown volume action: $action (up/down/mute/set)" }
      }
      Write-Result @{ ok = $true; data = @{ detail = "volume $action done" } }
    }

    'media' {
      $action = [string]$P
      $vk = switch ($action) {
        'playpause' { 0xB3 }
        'next' { 0xB0 }
        'prev' { 0xB1 }
        'stop' { 0xB2 }
        default { throw "unknown media action: $action (playpause/next/prev/stop)" }
      }
      Invoke-Key $vk
      Write-Result @{ ok = $true; data = @{ detail = "media $action done" } }
    }

    'clipboard-get' {
      $text = ''
      try { $text = [string](Get-Clipboard -Raw -ErrorAction Stop) } catch { $text = '' }
      Write-Result @{ ok = $true; data = @{ text = $text } }
    }

    'clipboard-set' {
      Set-Clipboard -Value ([string]$P.text)
      Write-Result @{ ok = $true; data = @{ detail = 'clipboard updated' } }
    }

    'screenshot' {
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $dir = [string]$P
      if ([string]::IsNullOrWhiteSpace($dir)) { $dir = Join-Path $env:TEMP 'arrodes' }
      if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
      $path = Join-Path $dir ("screenshot_{0:yyyyMMdd_HHmmss}.png" -f (Get-Date))
      $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
      $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
      $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose()
      $bmp.Dispose()
      $size = (Get-Item $path).Length
      Write-Result @{ ok = $true; data = @{ path = $path; sizeBytes = $size } }
    }

    'lock-screen' {
      rundll32.exe user32.dll,LockWorkStation
      Write-Result @{ ok = $true; data = @{ detail = 'screen locked' } }
    }

    'get-foreground' {
      Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ArrodesFgWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  public static string Get() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return "0|";
    uint pid;
    GetWindowThreadProcessId(h, out pid);
    var sb = new StringBuilder(512);
    GetWindowText(h, sb, sb.Capacity);
    return pid + "|" + sb.ToString();
  }
}
"@ -ErrorAction SilentlyContinue
      $raw = [ArrodesFgWin]::Get()
      $parts = $raw -split '\|', 2
      $pidVal = [int]$parts[0]
      $proc = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
      Write-Result @{
        ok = $true
        data = @{
          pid = $pidVal
          process = if ($proc) { $proc.ProcessName } else { '' }
          title = if ($parts.Length -gt 1) { $parts[1] } else { '' }
        }
      }
    }

    'system-stats' {
      $cpu = [int](Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
      $os = Get-CimInstance Win32_OperatingSystem
      $totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
      $freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
      Write-Result @{
        ok = $true
        data = @{
          cpuPercent = $cpu
          memTotalGB = $totalGB
          memFreeGB = $freeGB
          memUsedGB = [math]::Round($totalGB - $freeGB, 1)
        }
      }
    }

    default { throw "unknown op: $Op" }
  }
} catch {
  Write-Result @{ ok = $false; error = $_.Exception.Message }
}
