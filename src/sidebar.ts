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
    const p1 = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    const p2 = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">`
    const p3 = '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    const p4 = '<style>body{font-family:var(--vscode-font-family);padding:12px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}h3{margin:12px 0 8px 0;font-weight:600}.grid{display:grid;grid-template-columns:1fr;gap:8px}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}@media(min-width:700px){.grid{grid-template-columns:1fr}.row{grid-template-columns:1fr 1fr}}select,input{width:100%;padding:6px;border:1px solid var(--vscode-input-border, var(--vscode-focusBorder));border-radius:4px;background:var(--vscode-input-background);color:var(--vscode-input-foreground)}button{width:100%;padding:8px;border:none;border-radius:4px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}.card{padding:10px;border:1px solid var(--vscode-panel-border);border-radius:6px;background:var(--vscode-panel-background)}</style>'
    const p5 = '</head><body>'
    const p6 = '<div class="card"><h3>Projects</h3><div class="grid"><label>Target Project</label><select id="project"></select><label>Startup Project</label><select id="startup"></select><div class="row"><button id="save">Save Defaults</button><button id="refresh">Refresh Contexts</button></div></div></div>'
    const p7 = '<div class="card"><h3>DbContext</h3><div class="grid"><select id="context"><option value="">(optional)</option></select></div></div>'
    const p8 = '<div class="card"><h3>Commands</h3><div class="grid"><input id="migName" placeholder="Migration name"><input id="outputDir" placeholder="Migration output folder (optional)"><div class="row"><button id="add">Add Migration</button><button id="remove">Remove Last Migration</button></div><input id="updateTarget" placeholder="Update target (optional)"><input id="connection" placeholder="Connection string override (optional)"><div class="row"><button id="update">Update Database</button><button id="listMig">List Migrations</button></div><div class="row"><button id="listCtx">List DbContexts</button><button id="script">Script Migrations</button></div><div class="row"><button id="drop">Drop Database</button><button id="terminal">Open Terminal</button></div><button id="install">Install dotnet-ef</button></div></div>'
    const script = "(function(){const v=acquireVsCodeApi();const project=document.getElementById('project');const startup=document.getElementById('startup');const save=document.getElementById('save');const context=document.getElementById('context');const refresh=document.getElementById('refresh');const add=document.getElementById('add');const update=document.getElementById('update');const remove=document.getElementById('remove');const listMig=document.getElementById('listMig');const listCtx=document.getElementById('listCtx');const runScript=document.getElementById('script');const drop=document.getElementById('drop');const terminal=document.getElementById('terminal');const install=document.getElementById('install');const migName=document.getElementById('migName');const outputDir=document.getElementById('outputDir');const updateTarget=document.getElementById('updateTarget');const connection=document.getElementById('connection');const from=document.getElementById('from');const to=document.getElementById('to');let cs=[];function send(t,p){v.postMessage(Object.assign({type:t},p||{}))}window.addEventListener('message',function(e){const m=e.data;if(m.type==='initData'){cs=m.csprojs;project.innerHTML=cs.map(function(o){return '<option value=\"'+o.value+'\">'+o.label+'</option>'}).join('');startup.innerHTML=cs.map(function(o){return '<option value=\"'+o.value+'\">'+o.label+'</option>'}).join('');if(m.defaults.project){const p=cs.find(function(o){return o.label===m.defaults.project||o.value.endsWith(m.defaults.project)});if(p)project.value=p.value}if(m.defaults.startup){const s=cs.find(function(o){return o.label===m.defaults.startup||o.value.endsWith(m.defaults.startup)});if(s)startup.value=s.value}send('refreshContexts',{project:project.value,startup:startup.value})}if(m.type==='contexts'){context.innerHTML='<option value=\"\">(optional)</option>'+m.items.map(function(i){return '<option value=\"'+i+'\">'+i+'</option>'}).join('')}});document.getElementById('save').addEventListener('click',function(){send('saveDefaults',{project:project.value,startup:startup.value})});document.getElementById('refresh').addEventListener('click',function(){send('refreshContexts',{project:project.value,startup:startup.value})});document.getElementById('add').addEventListener('click',function(){const name=migName.value.trim();if(!name)return;send('run',{action:'addMigration',project:project.value,startup:startup.value,context:context.value,name:name,outputDir:outputDir.value.trim()})});document.getElementById('update').addEventListener('click',function(){send('run',{action:'updateDatabase',project:project.value,startup:startup.value,context:context.value,target:updateTarget.value.trim(),connection:connection.value.trim()})});document.getElementById('remove').addEventListener('click',function(){send('run',{action:'removeMigration',project:project.value,startup:startup.value})});document.getElementById('listMig').addEventListener('click',function(){send('run',{action:'listMigrations',project:project.value,startup:startup.value})});document.getElementById('listCtx').addEventListener('click',function(){send('run',{action:'listDbContexts',project:project.value,startup:startup.value})});runScript.addEventListener('click',function(){send('run',{action:'scriptMigration',project:project.value,startup:startup.value,from:from.value.trim(),to:to.value.trim()})});drop.addEventListener('click',function(){send('run',{action:'dropDatabase',project:project.value,startup:startup.value,connection:connection.value.trim()})});terminal.addEventListener('click',function(){send('openTerminal',{})});install.addEventListener('click',function(){send('installEf',{})});send('init',{})})();"
    const p9 = `<script nonce="${nonce}">` + script + `</script>`
    const p10 = '</body></html>'
    return [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10].join('')
  }
}
