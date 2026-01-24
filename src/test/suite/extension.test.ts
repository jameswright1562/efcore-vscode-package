import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import * as ef from '../../ef';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as util from 'util';

const exec = util.promisify(cp.exec);

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

    let sandbox: sinon.SinonSandbox;
    let terminalStub: any;
    let sendTextSpy: sinon.SinonSpy;
    let showInputBoxStub: sinon.SinonStub;
    let showQuickPickStub: sinon.SinonStub;

    setup(async () => {
        sandbox = sinon.createSandbox();
        
        // Activate extension
 		const ext = vscode.extensions.getExtension('JamesWright.vscode-efcore-tools');
 		if (ext) {
 			await ext.activate();
 		}

        sendTextSpy = sandbox.spy();
        terminalStub = {
            sendText: sendTextSpy,
            show: sandbox.spy(),
            exitStatus: undefined,
            dispose: sandbox.spy()
        };

        // Stub createTerminal to return our mock
        sandbox.stub(vscode.window, 'createTerminal').returns(terminalStub);

        // Stub input methods
        showInputBoxStub = sandbox.stub(vscode.window, 'showInputBox');
        showQuickPickStub = sandbox.stub(vscode.window, 'showQuickPick');

        // Un-stub listDbContexts to verify real project parsing
        // We only stub pickProject/pickStartupProject because the test environment 
        // might behave unpredictably with multiple files or VS Code API delays.
        // But for this test project, we know there is only one.
        // Let's rely on the real logic for picking projects too!
    });

    teardown(() => {
        if (terminalStub) {
            terminalStub.exitStatus = { code: 0 };
        }
        sandbox.restore();
    });

    async function cleanup() {
        // Clean up migrations and database
        const projectDir = path.resolve(__dirname, '../../../efcore-test-project');
        const migrationsDir = path.join(projectDir, 'Migrations');
        const dbFile = path.join(projectDir, 'app.db');

        if (fs.existsSync(migrationsDir)) {
            fs.rmSync(migrationsDir, { recursive: true, force: true });
        }
        if (fs.existsSync(dbFile)) {
            fs.rmSync(dbFile, { force: true });
        }
    }

    // Helper to execute the command string that the extension generated
    async function executeGeneratedCommand(command: string) {
        console.log(`Executing: ${command}`);
        try {
            const { stdout, stderr } = await exec(command);
            console.log(stdout);
            if (stderr) console.error(stderr);
        } catch (e: any) {
            console.error(`Command failed: ${e.message}`);
            if (e.stdout) console.log('STDOUT:', e.stdout);
            if (e.stderr) console.error('STDERR:', e.stderr);
            throw e;
        }
    }

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('JamesWright.vscode-efcore-tools'));
	});

	test('efcore.addMigration creates actual migration files', async () => {
        await cleanup();

		showInputBoxStub.onFirstCall().resolves('InitialCreate'); // Name
		showInputBoxStub.onSecondCall().resolves(''); // Output dir

		await vscode.commands.executeCommand('efcore.addMigration');

		assert.ok(sendTextSpy.called, 'Terminal.sendText was not called');
        const command = sendTextSpy.lastCall.args[0];
        
        // Execute the generated command
        await executeGeneratedCommand(command);

        // Verify side effects
        const projectDir = path.resolve(__dirname, '../../../efcore-test-project');
        const migrationsDir = path.join(projectDir, 'Migrations');
        
        assert.ok(fs.existsSync(migrationsDir), 'Migrations folder should be created');
        const files = fs.readdirSync(migrationsDir);
        assert.ok(files.some(f => f.includes('InitialCreate')), 'Migration file should exist');
	}).timeout(20000); // Increase timeout for dotnet commands

    test('efcore.updateDatabase creates sqlite database', async () => {
        // Assume addMigration ran successfully or database update will apply pending migrations
        // If this test runs independently, we might need a migration first. 
        // But in this suite they run sequentially.

        showInputBoxStub.onFirstCall().resolves(''); 
        showInputBoxStub.onSecondCall().resolves(''); 

        await vscode.commands.executeCommand('efcore.updateDatabase');

        assert.ok(sendTextSpy.called);
        const command = sendTextSpy.lastCall.args[0];

        // Execute
        await executeGeneratedCommand(command);

        // Verify side effects
        const projectDir = path.resolve(__dirname, '../../../efcore-test-project');
        const dbFile = path.join(projectDir, 'app.db');
        
        assert.ok(fs.existsSync(dbFile), 'app.db should be created');
    }).timeout(20000);

    test('efcore.removeMigration actually removes files', async () => {
        // First revert the database changes so we can remove the migration
        const projectDir = path.resolve(__dirname, '../../../efcore-test-project');
        const csproj = path.join(projectDir, 'efcore-test-project.csproj');
        // Construct revert command manually
        const revertCommand = `dotnet ef database update 0 --project "${csproj}" --startup-project "${csproj}"`;
        await executeGeneratedCommand(revertCommand);

        await vscode.commands.executeCommand('efcore.removeMigration');

        assert.ok(sendTextSpy.called);
        const command = sendTextSpy.lastCall.args[0];

        // Execute
        await executeGeneratedCommand(command);

        // Verify side effects
        // Since we only had 'InitialCreate', removing it should empty the migrations or remove the file
        const migrationsDir = path.join(projectDir, 'Migrations');
        
        // It might not remove the folder, but should remove the specific migration files
        if (fs.existsSync(migrationsDir)) {
            const files = fs.readdirSync(migrationsDir);
            assert.ok(!files.some(f => f.includes('InitialCreate')), 'InitialCreate migration should be removed');
        }
    }).timeout(20000);

    test('efcore.dbcontextList returns actual context from project', async () => {
        // This command doesn't use the terminal sendText, it uses execFile internally and returns the list.
        // So we can verify the internal logic directly if we call listDbContexts, 
        // but to test the *command* 'efcore.dbcontextList', it prints to terminal.
        // We want to verify `ef.listDbContexts` works against the real project.
        
        // We'll call the internal function directly to verify parsing, 
        // as the command just prints to terminal which is hard to read back.
        const projectDir = path.resolve(__dirname, '../../../efcore-test-project');
        // We need to resolve the .csproj path
        const csproj = path.join(projectDir, 'efcore-test-project.csproj');
        
        // We need to find dotnet path
        const dotnet = await ef.ensureDotnet();
        
        const contexts = await ef.listDbContexts(dotnet, csproj, csproj, projectDir);
        
        assert.ok(contexts.length > 0, 'Should find at least one DbContext');
        assert.ok(contexts.includes('EfCoreTestProject.AppDbContext'), `Should find AppDbContext. Found: ${contexts.join(', ')}`);
    }).timeout(20000);
});
