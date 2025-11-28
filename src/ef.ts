import * as vscode from 'vscode'
import * as path from 'path'
import { execFile } from 'child_process'

let efTerminal: vscode.Terminal | undefined

export function getConfig() {
  const cfg = vscode.workspace.getConfiguration('efcore')
  return {
    dotnetPath: cfg.get<string>('dotnetPath') || 'dotnet',
    defaultProject: cfg.get<string>('defaultProject') || '',
    defaultStartupProject: cfg.get<string>('defaultStartupProject') || '',
    workDir: cfg.get<string>('workDir') || ''
  }
}

export async function findCsprojFiles() {
  const files = await vscode.workspace.findFiles('**/*.csproj', '**/{bin,obj}/**')
  return files
}

function resolveInWorkspace(p: string) {
  const ws = vscode.workspace.workspaceFolders
  if (!ws || ws.length === 0) return p
  const root = ws[0].uri.fsPath
  if (!p) return root
  if (path.isAbsolute(p)) return p
  return path.join(root, p)
}

export async function pickProject(title: string) {
  const cfg = getConfig()
  const defaultPath = cfg.defaultProject
  const files = await findCsprojFiles()
  const items = files.map(f => ({ label: path.basename(f.fsPath), description: vscode.workspace.asRelativePath(f.fsPath), full: f.fsPath }))
  if (defaultPath) {
    const resolved = resolveInWorkspace(defaultPath)
    const match = items.find(i => i.full === resolved)
    if (match) return match.full
  }
  if (items.length === 1) return items[0].full
  const pick = await vscode.window.showQuickPick(items, { title, matchOnDescription: true })
  if (!pick) return undefined
  return pick.full
}

export async function pickStartupProject(title: string) {
  const cfg = getConfig()
  const defaultPath = cfg.defaultStartupProject
  const files = await findCsprojFiles()
  const items = files.map(f => ({ label: path.basename(f.fsPath), description: vscode.workspace.asRelativePath(f.fsPath), full: f.fsPath }))
  if (defaultPath) {
    const resolved = resolveInWorkspace(defaultPath)
    const match = items.find(i => i.full === resolved)
    if (match) return match.full
  }
  if (items.length === 1) return items[0].full
  const pick = await vscode.window.showQuickPick(items, { title, matchOnDescription: true })
  if (!pick) return undefined
  return pick.full
}

export async function ensureDotnet() {
  const cfg = getConfig()
  return new Promise<string>((resolve, reject) => {
    execFile(cfg.dotnetPath, ['--version'], { cwd: cfg.workDir ? resolveInWorkspace(cfg.workDir) : undefined }, (err) => {
      if (err) reject(err)
      else resolve(cfg.dotnetPath)
    })
  })
}

export function getEfTerminal() {
  if (!efTerminal || efTerminal.exitStatus) {
    efTerminal = vscode.window.createTerminal({ name: 'EF Core' })
  }
  efTerminal.show(true)
  return efTerminal
}

export function runEfCommand(args: string[], cwd?: string) {
  const t = getEfTerminal()
  if (cwd) t.sendText(`cd "${cwd}"`)
  t.sendText(args.join(' '))
}

export async function listDbContexts(dotnetPath: string, project: string, startup: string, cwd?: string) {
  const cmd = [dotnetPath, 'ef', 'dbcontext', 'list', '--project', project, '--startup-project', startup]
  return new Promise<string[]>((resolve) => {
    execFile(cmd[0], cmd.slice(1), { cwd }, (err, stdout) => {
      if (err) resolve([])
      else {
        const lines = stdout.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0 && s.toLocaleLowerCase().includes("context"))
        resolve(lines)
      }
    })
  })
}

export function resolveWorkDir() {
  const cfg = getConfig()
  const wd = cfg.workDir
  return wd ? resolveInWorkspace(wd) : undefined
}

