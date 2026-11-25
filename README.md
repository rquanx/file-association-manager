# File Association Manager

File Association Manager is a Windows desktop app for changing the default app for multiple file extensions at once. Use it to assign video formats to one player, recreate your defaults on a new PC, or roll back an earlier change.

## Get started

The project is currently available as source. On Windows 11, install Git and Node.js 22.12 or later with npm. The desktop app uses Windows PowerShell (`powershell.exe`) to read and update file associations for the signed-in Windows account.

~~~powershell
git clone https://github.com/rquanx/file-association-manager.git
cd file-association-manager
npm ci
npm start
~~~

To build a portable executable, run `npm run package` after installing dependencies. The executable is written to `release/FileAssociationManager-<version>-portable.exe` and runs without a separate Node.js installation.

## Change default apps in bulk

1. Click **Select app** and choose a registered Windows app. To use a portable program, choose **Browse for an .exe** and select its executable.
2. Pick a collection or search by extension or current default app. Use **Supported formats only** to narrow the list to eligible extensions.
3. Select the extensions to change. The table header checkbox selects all eligible extensions in the filtered results, including those on other pages.
4. Click **Apply associations** and review the list before confirming. The results show which changes were applied, which extensions already had the target default, and which changes failed.

Built-in collections cover video, images, audio, documents, archives, and code and web files. To create your own, start with **New collection**, copy an existing collection, or use **Save as collection** to keep your current selection.

Under **Settings**, choose a light, dark, or system appearance and a color palette. English is the default interface language. Choose **Language** to switch to Simplified Chinese. The app remembers your choice.

## Move your defaults to another PC

1. On the old PC, click **Export** to save a JSON backup of your custom collections and the current associations the app can identify. The backup records extension names and app identifiers.
2. On the destination PC, install the apps you want to use or have their portable executables ready. Click **Import** and open the backup.
3. Review the current default and proposed target for each extension. Select the assignments you want to restore. For unmatched apps, choose a registered local app or browse to a portable executable. If a registered app has no handler for a format, the preview shows which extensions still need a match.
4. Choose **Import and restore** to apply the selected associations, or **Import collections only** to transfer your custom collections. When a collection ID already exists, the imported copy replaces it. Backups are limited to 4 MB.

## Review and roll back changes

Open **Association history** to see the date and time, file extension, previous and new defaults, and whether a change came from a manual assignment, an import, or a rollback. Search by extension, app, or date and filter by extension or action.

Rolling back an entry restores the app listed as its previous default. If the default changed from App A to App B and later to App C, rolling back the A-to-B entry restores App A. The confirmation shows the current default and the restore target. The previous app must still be available.

The app journals changes before applying them. After an interruption, it checks the current Windows settings, adds confirmed changes to history, and flags outcomes it could not verify. History, collections, and preferences are stored locally.

## Windows compatibility and troubleshooting

- The app uses PS-SFTA to update per-user file associations, including the `UserChoiceLatest` mechanism on Windows 11. Windows updates can change how associations are accepted, and Windows may reject individual changes.
- Use **Retry failed items** to rerun failed changes. If Windows still rejects a change, use **Open Windows Settings** to set the default in **Apps → Default apps**. To verify the result, double-click a sample file in File Explorer.
- If an installed app is missing or shows **No registered handler**, check that it registers support for that extension. If you move a portable app, browse to its new executable and apply the association again.

## Development

The app uses Electron, React, and Vite. The `src/` directory contains the interface. The `desktop/` directory contains the Electron main process, backup and history logic, and PowerShell worker.

| Command | Purpose |
| --- | --- |
| `npm start` | Build the interface and launch the desktop app. |
| `npm run build` | Build the interface into `dist/`. |
| `npm run package` | Build the Windows portable executable. |
| `npm test` | Test selective migration and association history recovery. |
| `npm run test:windows` | Test rollback, external changes, and partial retries using temporary file extensions that the script cleans up. |

## Reporting issues

Include the app version, Windows version and build, target app, affected extensions, and what opens when you double-click a file in File Explorer. [GitHub Issues](https://github.com/rquanx/file-association-manager/issues)

## License

File Association Manager is released under the MIT License. The bundled PS-SFTA script retains its upstream MIT notice. [Project license](LICENSE) · [PS-SFTA notice](SFTA-NOTICE.txt) · [Upstream PS-SFTA](https://github.com/ComoEstaisAmigos/PS-SFTA)
