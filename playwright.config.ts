import { defineConfig } from '@playwright/test';

// Pin to IPv4: "localhost" can resolve to ::1 or 127.0.0.1, and on Windows the
// mismatch caused intermittent ~10s connection stalls and page.goto timeouts.
const BASE_URL = 'http://127.0.0.1:4173';

export default defineConfig({
	// Wait for a real HTTP response (not just an open port) so the first test doesn't hit a cold server
	webServer: {
		command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
		url: `${BASE_URL}/`,
		timeout: 180_000
	},
	use: { baseURL: BASE_URL },
	// Each pipeline page runs a 60fps D3 animation; too many parallel browsers starve the
	// preview server and page loads time out. 4 workers is stable (70/70 in repeat runs).
	workers: 4,
	// On this Windows machine, loopback connections occasionally freeze for ~20s while new
	// browser processes start (external curl probes time out too, so it's environmental, not
	// the app). One retry absorbs it; Playwright still reports such tests as "flaky".
	retries: 1,
	testMatch: '**/*.e2e.{ts,js}'
});
