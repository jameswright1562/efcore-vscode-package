import * as vscode from 'vscode'
import { ensureDotnet, findCsprojFiles, listDbContexts, runEfCommand, getConfig, resolveWorkDir } from './ef'

export class EfSidebarProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) { }
  resolveWebviewView(view: vscode.WebviewView) {
    view.webview.options = { enableScripts: true }
    view.webview.html = this.getHtml()

    view.webview.onDidReceiveMessage(async msg => {
      const cfg = getConfig()
      const wd = resolveWorkDir()
      if (msg.type === 'init') {
        const files = await findCsprojFiles()
        const options = files.map(f => ({ label: vscode.workspace.asRelativePath(f.fsPath), value: f.fsPath }))
        view.webview.postMessage({ type: 'initData', csprojs: options, defaults: { project: cfg.defaultProject, startup: cfg.defaultStartupProject } })
      }
      if (msg.type === 'saveDefaults') {
        const relProj = vscode.workspace.asRelativePath(msg.project)
        const relStartup = vscode.workspace.asRelativePath(msg.startup)
        const scfg = vscode.workspace.getConfiguration('efcore')
        await scfg.update('defaultProject', relProj, vscode.ConfigurationTarget.Workspace)
        await scfg.update('defaultStartupProject', relStartup, vscode.ConfigurationTarget.Workspace)
        vscode.window.showInformationMessage('EF Core defaults updated')
      }
      if (msg.type === 'refreshContexts') {
        try {
          const dotnet = await ensureDotnet()
          const ctxs = await listDbContexts(dotnet, msg.project, msg.startup, wd)
          view.webview.postMessage({ type: 'contexts', items: ctxs })
        } catch { }
      }
      if (msg.type === 'run') {
        try {
          const dotnet = await ensureDotnet()
          const args = this.buildArgs(dotnet, msg.action, msg)
          runEfCommand(args, wd)
        } catch {
          vscode.window.showErrorMessage('dotnet not found')
        }
      }
      if (msg.type === 'openTerminal') {
        runEfCommand([getConfig().dotnetPath], wd)
      }
      if (msg.type === 'installEf') {
        const dotnet = getConfig().dotnetPath
        runEfCommand([dotnet, 'tool', 'install', '--global', 'dotnet-ef'], wd)
      }
    })
  }
  buildArgs(dotnet: string, action: string, msg: any) {
    const project = msg.project
    const startup = msg.startup
    const ctxArg = msg.context && msg.context.length > 0 ? ['--context', msg.context] : []
    if (action === 'addMigration') {
      const outArg = msg.outputDir && msg.outputDir.length > 0 ? ['--output-dir', msg.outputDir] : []
      return [dotnet, 'ef', 'migrations', 'add', msg.name, '--project', project, '--startup-project', startup, ...outArg, ...ctxArg]
    }
    if (action === 'updateDatabase') {
      const base = [dotnet, 'ef', 'database', 'update']
      const target = msg.target && msg.target.length > 0 ? [msg.target] : []
      const conn = msg.connection && msg.connection.length > 0 ? ['--connection', msg.connection] : []
      return [...base, ...target, '--project', project, '--startup-project', startup, ...conn]
    }
    if (action === 'removeMigration') return [dotnet, 'ef', 'migrations', 'remove', '--project', project, '--startup-project', startup]
    if (action === 'listMigrations') return [dotnet, 'ef', 'migrations', 'list', '--project', project, '--startup-project', startup]
    if (action === 'listDbContexts') return [dotnet, 'ef', 'dbcontext', 'list', '--project', project, '--startup-project', startup]
    if (action === 'scriptMigration') {
      const args = [dotnet, 'ef', 'migrations', 'script']
      if (msg.from && msg.from.length > 0) args.push(msg.from)
      if (msg.to && msg.to.length > 0) args.push(msg.to)
      args.push('--project', project, '--startup-project', startup)
      return args
    }
    if (action === 'dropDatabase') {
      const conn = msg.connection && msg.connection.length > 0 ? ['--connection', msg.connection] : []
      return [dotnet, 'ef', 'database', 'drop', '--force', '--project', project, '--startup-project', startup, ...conn]
    }
    return [dotnet]
  }
  getHtml() {
    const nonce = String(Date.now())
    const style = `
      <style>
        :root {
          --container-padding: 20px;
          --input-padding: 6px;
          --label-margin: 4px;
        }
        body {
          font-family: var(--vscode-font-family);
          padding: var(--container-padding);
          color: var(--vscode-foreground);
          background-color: var(--vscode-sideBar-background);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        h3 {
          margin: 0 0 8px 0;
          font-size: 11px;
          text-transform: uppercase;
          opacity: 0.8;
          font-weight: 600;
        }
        .section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .row {
          display: flex;
          gap: 8px;
        }
        .row > * {
          flex: 1;
        }
        label {
          font-size: 12px;
          margin-bottom: var(--label-margin);
          display: block;
          opacity: 0.9;
        }
        select, input {
          width: 100%;
          box-sizing: border-box;
          padding: var(--input-padding);
          border: 1px solid var(--vscode-input-border);
          background-color: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border-radius: 2px;
          outline: none;
        }
        select:focus, input:focus {
          border-color: var(--vscode-focusBorder);
        }
        button {
          width: 100%;
          padding: 8px;
          border: none;
          border-radius: 2px;
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          cursor: pointer;
          font-weight: 500;
        }
        button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
        button.secondary {
          background-color: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
          background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .separator {
          height: 1px;
          background-color: var(--vscode-panel-border);
          margin: 8px 0;
          opacity: 0.5;
        }
      </style>
    `
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${style}
      </head>
      <body>
        <div class="section">
          <h3>Projects</h3>
          <div>
            <label>Target Project</label>
            <select id="project"></select>
          </div>
          <div>
            <label>Startup Project</label>
            <select id="startup"></select>
          </div>
          <div class="row">
            <button id="save" class="secondary">Save Defaults</button>
            <button id="refresh" class="secondary">Refresh Contexts</button>
          </div>
        </div>

        <div class="separator"></div>

        <div class="section">
          <h3>DbContext</h3>
          <select id="context">
            <option value="">(optional)</option>
          </select>
        </div>

        <div class="separator"></div>

        <div class="section">
          <h3>Migrations</h3>
          <input id="migName" placeholder="Migration Name (Required)">
          <input id="outputDir" placeholder="Output Folder (Optional)">
          <div class="row">
            <button id="add">Add Migration</button>
            <button id="remove" class="secondary">Remove Last</button>
          </div>
        </div>

        <div class="separator"></div>

        <div class="section">
          <h3>Database</h3>
          <input id="updateTarget" placeholder="Target Migration (Optional)">
          <input id="connection" placeholder="Connection String Override (Optional)">
          <div class="row">
            <button id="update">Update DB</button>
            <button id="drop" class="secondary">Drop DB</button>
          </div>
        </div>

        <div class="separator"></div>

        <div class="section">
          <h3>Tools</h3>
          <div class="row">
            <button id="listMig" class="secondary">List Migrations</button>
            <button id="listCtx" class="secondary">List Contexts</button>
          </div>
          <div class="row">
            <button id="script" class="secondary">Script Migration</button>
            <button id="terminal" class="secondary">Open Terminal</button>
          </div>
          <button id="install" class="secondary" style="margin-top: 8px">Install dotnet-ef Tool</button>
        </div>

        <script nonce="${nonce}">
          (function(){
            const v = acquireVsCodeApi();
            const project = document.getElementById('project');
            const startup = document.getElementById('startup');
            const save = document.getElementById('save');
            const context = document.getElementById('context');
            const refresh = document.getElementById('refresh');
            const add = document.getElementById('add');
            const update = document.getElementById('update');
            const remove = document.getElementById('remove');
            const listMig = document.getElementById('listMig');
            const listCtx = document.getElementById('listCtx');
            const runScript = document.getElementById('script');
            const drop = document.getElementById('drop');
            const terminal = document.getElementById('terminal');
            const install = document.getElementById('install');
            const migName = document.getElementById('migName');
            const outputDir = document.getElementById('outputDir');
            const updateTarget = document.getElementById('updateTarget');
            const connection = document.getElementById('connection');

            function send(type, payload) {
              v.postMessage({ type, ...payload });
            }

            window.addEventListener('message', e => {
              const m = e.data;
              if (m.type === 'initData') {
                const opts = m.csprojs.map(o => '<option value="' + o.value + '">' + o.label + '</option>').join('');
                project.innerHTML = opts;
                startup.innerHTML = opts;
                
                if (m.defaults.project) {
                  const p = m.csprojs.find(o => o.label === m.defaults.project || o.value.endsWith(m.defaults.project));
                  if (p) project.value = p.value;
                }
                if (m.defaults.startup) {
                  const s = m.csprojs.find(o => o.label === m.defaults.startup || o.value.endsWith(m.defaults.startup));
                  if (s) startup.value = s.value;
                }
                send('refreshContexts', { project: project.value, startup: startup.value });
              }
              if (m.type === 'contexts') {
                context.innerHTML = '<option value="">(optional)</option>' + m.items.map(i => '<option value="' + i + '">' + i + '</option>').join('');
              }
            });

            save.onclick = () => send('saveDefaults', { project: project.value, startup: startup.value });
            refresh.onclick = () => send('refreshContexts', { project: project.value, startup: startup.value });
            
            add.onclick = () => {
              if (!migName.value) {
                migName.style.borderColor = 'var(--vscode-inputValidation-errorBorder)';
                return;
              }
              migName.style.borderColor = '';
              send('run', { action: 'addMigration', name: migName.value, outputDir: outputDir.value, project: project.value, startup: startup.value, context: context.value });
            };

            update.onclick = () => send('run', { action: 'updateDatabase', target: updateTarget.value, connection: connection.value, project: project.value, startup: startup.value, context: context.value });
            remove.onclick = () => send('run', { action: 'removeMigration', project: project.value, startup: startup.value, context: context.value });
            listMig.onclick = () => send('run', { action: 'listMigrations', project: project.value, startup: startup.value, context: context.value });
            listCtx.onclick = () => send('run', { action: 'listDbContexts', project: project.value, startup: startup.value });
            runScript.onclick = () => send('run', { action: 'scriptMigration', project: project.value, startup: startup.value, context: context.value });
            drop.onclick = () => send('run', { action: 'dropDatabase', connection: connection.value, project: project.value, startup: startup.value, context: context.value });
            terminal.onclick = () => send('openTerminal');
            install.onclick = () => send('installEf');

            project.onchange = () => send('refreshContexts', { project: project.value, startup: startup.value });
            
            // Initial request
            send('init');
          })();
        </script>
      </body>
      </html>
    `
    return html
  }
}
