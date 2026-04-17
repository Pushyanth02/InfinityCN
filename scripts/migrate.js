import fs from 'fs';
import path from 'path';

// Define old path to new path mapping
// Ensure the mapping represents your actual refactor rules.
const map = {
    // Phase 1: Settings Components
    'src/components/APIKeyInput.tsx': 'src/features/settings/components/ApiKeyInput.tsx',
    'src/components/CinematifierSettings.tsx': 'src/features/settings/components/AppSettings.tsx',
    'src/components/ProviderCard.tsx': 'src/features/settings/components/ProviderCard.tsx',
    'src/components/ProviderSection.tsx': 'src/features/settings/components/ProviderSection.tsx',
    'src/components/PreferencesSection.tsx': 'src/features/settings/components/PreferencesSection.tsx'
};

const updateImports = (newPath, fileMap) => {
    // Advanced regex-based or AST-based import rewriting logic would go here.
    // E.g., loading file contents and substituting 'src/hooks' with '@shared/hooks'.
    console.log(`[INFO] Ensure you run tests to check imports for ${newPath}`);
};

async function migrate() {
    console.log('Starting safe migration script...');

    for (const [oldPath, newPath] of Object.entries(map)) {
        const fullOldPath = path.resolve(oldPath);
        const fullNewPath = path.resolve(newPath);

        if (fs.existsSync(fullOldPath)) {
            const newDir = path.dirname(fullNewPath);
            // Construct parent directories if missing
            if (!fs.existsSync(newDir)) {
                fs.mkdirSync(newDir, { recursive: true });
                console.log(`Created dir: ${newDir}`);
            }

            // Perform the move
            fs.renameSync(fullOldPath, fullNewPath);
            console.log(`Moved: ${oldPath} -> ${newPath}`);

            // Hook to update imports
            updateImports(fullNewPath, map);
        } else {
            console.log(`[SKIPPED] Source missing: ${oldPath}`);
        }
    }

    console.log(
        `⚡ Migration scaffolding finished. You must manually verify alias configuration in tsconfig.json`,
    );
}

migrate().catch(console.error);
