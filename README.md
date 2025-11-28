EF Core Tools VS Code Extension

Features

- Runs `dotnet ef` commands from a Quick Pick UI.
- Chooses target and startup `.csproj` via picker or saved defaults.
- Shows output in a dedicated integrated terminal.
- Lists DbContexts and optionally targets a specific context.

Commands

- `EF Core: Quick Run` to access all common EF tasks.
- `EF Core: Add Migration`
- `EF Core: Update Database`
- `EF Core: Remove Last Migration`
- `EF Core: List Migrations`
- `EF Core: List DbContexts`
- `EF Core: Script Migrations`
- `EF Core: Drop Database`
- `EF Core: Open Terminal`
- `EF Core: Set Default Projects`

Settings

- `efcore.dotnetPath`: Path to `dotnet`.
- `efcore.defaultProject`: Relative path to target `.csproj`.
- `efcore.defaultStartupProject`: Relative path to startup `.csproj`.
- `efcore.workDir`: Working directory; defaults to workspace root.

Usage

1. Open a workspace containing `.csproj` files.
2. Run `EF Core: Set Default Projects` to save commonly used projects.
3. Run `EF Core: Quick Run` and pick an action.
4. If `dotnet-ef` is not installed, install it with `EF Core: Quick Run` → `Install dotnet-ef` or manually: `dotnet tool install --global dotnet-ef`.

