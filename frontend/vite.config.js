import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      // Allow access from any device on the network
      host: true,
      
      // Proxy API requests to backend
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
          // Forward subdomain header to backend
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              // Extract subdomain from host or query param
              const host = req.headers.host || '';
              const hostWithoutPort = host.split(':')[0];
              const parts = hostWithoutPort.split('.');
              
              let subdomain = null;
              
              // Check for .localhost domain (e.g., fuk.localhost, demo.localhost)
              if (hostWithoutPort.endsWith('.localhost') && parts.length >= 2) {
                const sub = parts[0].toLowerCase();
                const reserved = ['www', 'api', 'admin'];
                if (!reserved.includes(sub)) {
                  subdomain = sub;
                }
              }
              // Check for .local domain subdomain (e.g., fuk.digitaltipi.local)
              else if (parts.length >= 3) {
                const sub = parts[0].toLowerCase();
                const reserved = ['www', 'api', 'admin'];
                if (!reserved.includes(sub)) {
                  subdomain = sub;
                }
              }
              
              // Check query param fallback
              if (!subdomain) {
                const url = new URL(req.url, `http://${host}`);
                subdomain = url.searchParams.get('subdomain');
              }
              
              if (subdomain) {
                proxyReq.setHeader('X-Subdomain', subdomain);
              }
            });
          },
        },
      },
    },
    
    // Build optimization
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // React core
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            // UI framework
            'vendor-ui': [
              '@radix-ui/react-dialog',
              '@radix-ui/react-select',
              '@radix-ui/react-tabs',
              '@radix-ui/react-toast',
              '@radix-ui/react-tooltip',
              'framer-motion',
              'class-variance-authority',
              'clsx',
              'tailwind-merge',
            ],
            // Icons
            'vendor-icons': ['@tabler/icons-react'],
            // Forms & validation
            'vendor-forms': ['react-hook-form', 'zod'],
            // HTTP client
            'vendor-http': ['axios'],
          },
        },
      },
    },

    // Environment variables
    define: {
      'import.meta.env.VITE_LOCAL_DEV': JSON.stringify(isDev),
    },
  };
});
