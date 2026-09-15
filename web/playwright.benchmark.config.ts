import {defineConfig} from "@playwright/test";
export default defineConfig({testDir:"./tests/e2e",testMatch:/solver-benchmark\.spec\.ts/,use:{baseURL:"http://127.0.0.1:5175",browserName:"chromium"},webServer:{command:"npm run build && npx vite preview --host 127.0.0.1 --port 5175 --strictPort",url:"http://127.0.0.1:5175",reuseExistingServer:false,timeout:30000}});
