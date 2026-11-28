// Браузер для проверок: puppeteer-core из node_modules и Chrome, который стоит на компьютере (другой путь — переменная CHROME).
import fs from 'node:fs';
import path from 'node:path';
export { default as puppeteer } from 'puppeteer-core';
const win = [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map((d) => path.join(d, 'Google/Chrome/Application/chrome.exe'));
export const chrome = [process.env.CHROME, ...win, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(fs.existsSync);
if (!chrome) { console.log('Chrome не найден: установи Google Chrome или укажи путь в переменной CHROME'); process.exit(2); }
