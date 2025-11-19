import * as vscode from 'vscode';
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

import { exec } from 'child_process';

import { promisify } from 'util';

const execAsync = promisify(exec);

let statusBarItem: vscode.StatusBarItem;
let nextButton: vscode.StatusBarItem;
let previousButton: vscode.StatusBarItem;

let updateInterval: NodeJS.Timeout | undefined;

export async function activate(context: vscode.ExtensionContext) {

  console.log('Tidal Control extension is now active');

  // PREVIOUS button (←)
  previousButton = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  previousButton.text = '$(chevron-left)';
  previousButton.tooltip = 'Previous Track';
  previousButton.command = 'tidal-control.previous';
  previousButton.show();
  context.subscriptions.push(previousButton);

  // NEXT button (→)
  nextButton = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99
  );
  nextButton.text = '$(chevron-right)';
  nextButton.tooltip = 'Next Track';
  nextButton.command = 'tidal-control.next';
  nextButton.show();
  context.subscriptions.push(nextButton);

  // MAIN status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    98
  );
  statusBarItem.command = 'tidal-control.playPause';
  statusBarItem.tooltip = 'Click to play/pause Tidal';
  context.subscriptions.push(statusBarItem);

  // Update status bar initially and every 5 seconds
  updateStatusBar();
  updateInterval = setInterval(updateStatusBar, 5000);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('tidal-control.playPause', async () => {
      await sendMediaKey('PlayPause');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tidal-control.next', async () => {
      await sendMediaKey('Next');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tidal-control.previous', async () => {
      await sendMediaKey('Previous');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tidal-control.showNowPlaying', async () => {
      await showNowPlaying();
    })
  );

  async function sendMediaKey(key: 'PlayPause' | 'Next' | 'Previous') {
    try {
      const keyCode = {
        PlayPause: '0xB3',
        Next: '0xB0',
        Previous: '0xB1'
      }[key];

      // Create a temporary .ps1 script
      const psPath = path.join(os.tmpdir(), `sendMediaKey_${key}.ps1`);

      const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MediaKeys {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public const int KEYEVENTF_EXTENDEDKEY = 0x1;
    public const int KEYEVENTF_KEYUP = 0x2;
}
"@

$key = ${keyCode}
[MediaKeys]::keybd_event($key, 0, [MediaKeys]::KEYEVENTF_EXTENDEDKEY, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 50
[MediaKeys]::keybd_event($key, 0, [MediaKeys]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)
`.trim();

      fs.writeFileSync(psPath, psScript, { encoding: "utf8" });

      await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`);

      setTimeout(updateStatusBar, 500);

    } catch (err) {
      vscode.window.showErrorMessage(`Failed to send ${key} command: ${err}`);
    }
  }

  async function getCurrentMediaInfo(): Promise<{ artist: string, title: string, status: string } | null> {
    try {
      const { stdout, stderr } = await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${context.extensionPath}/src/media.ps1"`);

      if (stdout.trim().startsWith('ERROR:')) {
        return null;
      }
      if (stdout.trim()) {
        const parts = stdout.trim().split('|');
        if (parts.length >= 3) {
          return {
            artist: parts[0] || 'Unknown Artist',
            title: parts[1] || 'Unknown Track',
            status: parts[2]
          };
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async function updateStatusBar() {
    try {
      const mediaInfo = await getCurrentMediaInfo();
      if (mediaInfo) {
        const icon = mediaInfo.status === 'Paused' ? '$(play)' : '$(debug-pause)';

        statusBarItem.text = `${icon}  ${mediaInfo.artist} - ${mediaInfo.title}`;
        statusBarItem.show();
      } else {
        statusBarItem.text = '$(music) No media playing';
        statusBarItem.show();
      }
    } catch (error) {
      statusBarItem.text = '$(music) Tidal Control';
      statusBarItem.show();
    }
  }

  async function showNowPlaying() {
    try {
      const mediaInfo = await getCurrentMediaInfo();
      if (mediaInfo) {
        const status = mediaInfo.status === '4' ? 'Playing' : 'Paused';
        vscode.window.showInformationMessage(
          `Now ${status}: ${mediaInfo.title} by ${mediaInfo.artist}`
        );
      } else {
        vscode.window.showInformationMessage('No media currently playing.');
      }
    } catch (error) {
      vscode.window.showErrorMessage('Failed to get now playing info: ' + error);
    }
  }
}

export function deactivate() {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
}
