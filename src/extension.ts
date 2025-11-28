import * as vscode from 'vscode'
import * as path from 'path'
import { getConfig, pickProject, pickStartupProject, ensureDotnet, runEfCommand, listDbContexts, resolveWorkDir, getEfTerminal } from './ef'
import { EfSidebarProvider } from './sidebar'

export function activate(context: vscode.ExtensionContext) {
  const reg = (cmd: string, fn: (...args: any[]) => any) => context.subscriptions.push(vscode.commands.registerCommand(cmd, fn))
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('efcore.commands', new EfSidebarProvider(context.extensionUri)))
  reg('efcore.openTerminal', () => {
    getEfTerminal()
  })

  reg('efcore.setDefaults', async () => {
    const proj = await pickProject('Select default target project')
    if (!proj) return
    const startup = await pickStartupProject('Select default startup project')
    if (!startup) return
    const relProj = vscode.workspace.asRelativePath(proj)
    const relStartup = vscode.workspace.asRelativePath(startup)
    const cfg = vscode.workspace.getConfiguration('efcore')
    await cfg.update('defaultProject', relProj, vscode.ConfigurationTarget.Workspace)
    await cfg.update('defaultStartupProject', relStartup, vscode.ConfigurationTarget.Workspace)
    vscode.window.showInformationMessage('EF Core defaults updated')
  })

  reg('efcore.quickRun', async () => {
    const actions = [
      { label: 'Add Migration', cmd: 'efcore.addMigration' },
      { label: 'Update Database', cmd: 'efcore.updateDatabase' },
      { label: 'Remove Last Migration', cmd: 'efcore.removeMigration' },
      { label: 'List Migrations', cmd: 'efcore.listMigrations' },
      { label: 'List DbContexts', cmd: 'efcore.dbcontextList' },
      { label: 'Script Migrations', cmd: 'efcore.scriptMigration' },
      { label: 'Drop Database', cmd: 'efcore.dropDatabase' },
      { label: 'Install dotnet-ef', cmd: 'efcore.installEfTool' },
      { label: 'Open Terminal', cmd: 'efcore.openTerminal' },
      { label: 'Set Default Projects', cmd: 'efcore.setDefaults' }
    ]
    const pick = await vscode.window.showQuickPick(actions, { title: 'EF Core' })
    if (!pick) return
    if (pick.cmd === 'efcore.installEfTool') {
      const cfg = getConfig()
      const wd = resolveWorkDir()
      runEfCommand([cfg.dotnetPath, 'tool', 'install', '--global', 'dotnet-ef'], wd)
      return
    }
    await vscode.commands.executeCommand(pick.cmd)
  })

  reg('efcore.addMigration', async () => {
    const name = await vscode.window.showInputBox({ title: 'Migration name', validateInput: v => v.trim().length === 0 ? 'Required' : undefined })
    if (!name) return
    const outputDir = await vscode.window.showInputBox({ title: 'Migration output folder (optional, relative to .csproj dir)' })
    const project = await pickProject('Select target project')
    if (!project) return
    const startup = await pickStartupProject('Select startup project')
    if (!startup) return
    try {
      const dotnet = await ensureDotnet()
      const wd = resolveWorkDir()
      const contexts = await listDbContexts(dotnet, project, startup, wd)
      let ctxArg: string[] = []
      if (contexts.length > 1) {
        const ctxPick = await vscode.window.showQuickPick(contexts.map(c => ({ label: c })), { title: 'DbContext (optional)' })
        if (ctxPick) ctxArg = ['--context', ctxPick.label]
      }
      const outArg = outputDir && outputDir.trim().length > 0 ? ['--output-dir', outputDir.trim()] : []
      runEfCommand([dotnet, 'ef', 'migrations', 'add', name, '--project', project, '--startup-project', startup, ...outArg, ...ctxArg], wd)
    } catch (e) {
      vscode.window.showErrorMessage('dotnet not found')
    }
  })

  reg('efcore.updateDatabase', async () => {
    const target = await vscode.window.showInputBox({ title: 'Target migration (optional)' })
    const connection = await vscode.window.showInputBox({ title: 'Connection string override (optional)' })
    const project = await pickProject('Select target project')
    if (!project) return
    const startup = await pickStartupProject('Select startup project')
    if (!startup) return
    try {
      const dotnet = await ensureDotnet()
      const wd = resolveWorkDir()
      const args = [dotnet, 'ef', 'database', 'update', '--project', project, '--startup-project', startup]
      if (target && target.trim().length > 0) args.splice(4, 0, target.trim())
      if (connection && connection.trim().length > 0) args.push('--connection', connection.trim())
      runEfCommand(args, wd)
    } catch (e) {
      vscode.window.showErrorMessage('dotnet not found')
    }
  })

  reg('efcore.removeMigration', async () => {
    const project = await pickProject('Select target project')
    if (!project) return
    const startup = await pickStartupProject('Select startup project')
    if (!startup) return
    try {
      const dotnet = await ensureDotnet()
      const wd = resolveWorkDir()
      runEfCommand([dotnet, 'ef', 'migrations', 'remove', '--project', project, '--startup-project', startup], wd)
    } catch (e) {
      vscode.window.showErrorMessage('dotnet not found')
    }
  })

  reg('efcore.listMigrations', async () => {
    const project = await pickProject('Select target project')
    if (!project) return
    const startup = await pickStartupProject('Select startup project')
    if (!startup) return
    try {
      const dotnet = await ensureDotnet()
      const wd = resolveWorkDir()
      runEfCommand([dotnet, 'ef', 'migrations', 'list', '--project', project, '--startup-project', startup], wd)
    } catch (e) {
      vscode.window.showErrorMessage('dotnet not found')
    }
  })

  reg('efcore.dbcontextList', async () => {
    const project = await pickProject('Select target project')
    if (!project) return
    const startup = await pickStartupProject('Select startup project')
    if (!startup) return
    try {
      const dotnet = await ensureDotnet()
      const wd = resolveWorkDir()
      runEfCommand([dotnet, 'ef', 'dbcontext', 'list', '--project', project, '--startup-project', startup], wd)
    } catch (e) {
      vscode.window.showErrorMessage('dotnet not found')
    }
  })

  reg('efcore.scriptMigration', async () => {
    const from = await vscode.window.showInputBox({ title: 'From migration (optional)' })
    const to = await vscode.window.showInputBox({ title: 'To migration (optional)' })
    const project = await pickProject('Select target project')
    if (!project) return
    const startup = await pickStartupProject('Select startup project')
    if (!startup) return
    try {
      const dotnet = await ensureDotnet()
      const wd = resolveWorkDir()
      const args = [dotnet, 'ef', 'migrations', 'script']
      if (from && from.trim().length > 0) args.push(from.trim())
      if (to && to.trim().length > 0) args.push(to.trim())
      args.push('--project', project, '--startup-project', startup)
      runEfCommand(args, wd)
    } catch (e) {
      vscode.window.showErrorMessage('dotnet not found')
    }
  })

  reg('efcore.dropDatabase', async () => {
    const confirm = await vscode.window.showQuickPick(['Yes', 'No'], { title: 'Drop database?' })
    if (confirm !== 'Yes') return
    const connection = await vscode.window.showInputBox({ title: 'Connection string override (optional)' })
    const project = await pickProject('Select target project')
    if (!project) return
    const startup = await pickStartupProject('Select startup project')
    if (!startup) return
    try {
      const dotnet = await ensureDotnet()
      const wd = resolveWorkDir()
      const args = [dotnet, 'ef', 'database', 'drop', '--force', '--project', project, '--startup-project', startup]
      if (connection && connection.trim().length > 0) args.push('--connection', connection.trim())
      runEfCommand(args, wd)
    } catch (e) {
      vscode.window.showErrorMessage('dotnet not found')
    }
  })
}

export function deactivate() {}
