import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [
        tsconfigPaths()
    ],
    build: {
        rollupOptions: {
            input: {
                // Define your entry points here
                connectionsList: 'src/connectionsListIndex.tsx',
            },
            output: {
                dir: 'dist',
                entryFileNames: '[name].js',
                chunkFileNames: '[name]-[hash].js',
                assetFileNames: '[name][extname]'
            }
        }
    }
});