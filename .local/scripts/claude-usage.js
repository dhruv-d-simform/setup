#!/usr/bin/env -S node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const credentialsFilePath = path.join(os.homedir(), '.claude', '.credentials.json');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/api/oauth/usage';
const CACHE_FILE = path.join(os.tmpdir(), 'claude-usage-cache.json');
const CACHE_DURATION_MS = 180 * 1000;
const RATE_LIMIT_DEFAULT_RETRY_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10 * 1000;

const OUTPUT_FORMATS = ['json', 'compact', 'tmux', 'pretty'];

const argv = process.argv.slice(2);
const noCache = argv.includes('--no-cache');
const clearCache = argv.includes('--clear-cache');
const formatArg = argv.find(a => !a.startsWith('--')) ?? 'pretty';

if (!OUTPUT_FORMATS.includes(formatArg)) {
    console.error(`Invalid output format. Supported formats: ${OUTPUT_FORMATS.join(', ')}`);
    process.exit(1);
}

const outputFormat = formatArg;

async function readCredentials() {
    const credentials = JSON.parse(await fs.readFile(credentialsFilePath, 'utf-8'));
    const accessToken = credentials?.claudeAiOauth?.accessToken;
    const expiresAt = credentials?.claudeAiOauth?.expiresAt;

    if (!accessToken || typeof accessToken !== 'string') {
        throw new Error('Access token not found in credentials file.');
    }

    return { accessToken, expiresAt };
}

function isTokenExpired(expiresAt) {
    if (typeof expiresAt !== 'number') return false;
    return Date.now() >= expiresAt;
}

async function fetchClaudeUsage(accessToken) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(ANTHROPIC_API_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
        });
    } catch (err) {
        if (err.name === 'AbortError') throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s.`);
        throw err;
    } finally {
        clearTimeout(timeout);
    }

    if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        let retryAfterMs = RATE_LIMIT_DEFAULT_RETRY_MS;
        if (retryAfterHeader) {
            const seconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(seconds) && seconds > 0) retryAfterMs = seconds * 1000;
        }
        return { rateLimited: true, retryAfterMs };
    }

    if (!response.ok) {
        throw new Error(`Failed to fetch usage data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    const fiveHourUsageRaw = data?.five_hour?.utilization;
    const fiveHourResetTimeRaw = data?.five_hour?.resets_at;
    const sevenDayUsageRaw = data?.seven_day?.utilization;
    const sevenDayResetTimeRaw = data?.seven_day?.resets_at;

    const fiveHourUsage = typeof fiveHourUsageRaw === 'number' ? fiveHourUsageRaw : null;
    const sevenDayUsage = typeof sevenDayUsageRaw === 'number' ? sevenDayUsageRaw : null;

    const fiveHourResetTimeParsed = typeof fiveHourResetTimeRaw === 'string' ? Date.parse(fiveHourResetTimeRaw) : NaN;
    const sevenDayResetTimeParsed = typeof sevenDayResetTimeRaw === 'string' ? Date.parse(sevenDayResetTimeRaw) : NaN;

    const fiveHourResetTime = !isNaN(fiveHourResetTimeParsed) ? new Date(fiveHourResetTimeParsed) : null;
    const sevenDayResetTime = !isNaN(sevenDayResetTimeParsed) ? new Date(sevenDayResetTimeParsed) : null;

    if (fiveHourUsage === null && fiveHourResetTime === null && sevenDayUsage === null && sevenDayResetTime === null) {
        throw new Error('Unexpected response format from API: no usable fields found.');
    }

    return { fiveHourUsage, fiveHourResetTime, sevenDayUsage, sevenDayResetTime };
}

function formatResetCountdown(resetTime) {
    if (resetTime == null) return 'N/A';
    const msLeft = resetTime - Date.now();
    const totalMins = Math.max(0, Math.floor(msLeft / 60000));
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;

    if (msLeft < 0) return 'now';
    if (totalMins < 60) return `${mins}m`;
    if (msLeft < 24 * 3600 * 1000) return hours > 0 ? `${hours}h${mins > 0 ? `${mins}m` : ''}` : `${mins}m`;

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][resetTime.getDay()];
    const h = resetTime.getHours();
    const m = resetTime.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${days} ${h12}:${m}${ampm}`;
}

function formatCacheAge(cachedAt) {
    const totalMins = Math.floor((Date.now() - cachedAt) / 60000);
    if (totalMins === 0) return 'just now';
    if (totalMins < 60) return `${totalMins}m ago`;
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return mins > 0 ? `${hours}h${mins}m ago` : `${hours}h ago`;
}

function colorPercent(pct, forTmux = false, padWidth = 0) {
    const raw = pct != null ? `${pct}%` : 'N/A';
    const str = padWidth > 0 ? raw.padStart(padWidth) : raw;
    if (pct == null) return forTmux ? `#[fg=colour8]${str}#[default]` : `\x1b[2m${str}\x1b[0m`;
    if (forTmux) {
        let color;
        if (pct < 40) color = 'colour2';
        else if (pct < 65) color = 'colour3';
        else if (pct < 80) color = 'colour208';
        else color = 'colour1';
        return `#[fg=${color}]${str}#[default]`;
    }
    let code;
    if (pct < 40) code = '\x1b[32m';
    else if (pct < 65) code = '\x1b[33m';
    else if (pct < 80) code = '\x1b[38;5;208m';
    else code = '\x1b[31m';
    return `${code}${str}\x1b[0m`;
}

function progressBar(pct, width, forTmux = false) {
    const filled = pct != null ? Math.round((pct / 100) * width) : 0;
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    if (pct == null) return forTmux ? `#[fg=colour8]${bar}#[default]` : `\x1b[2m${bar}\x1b[0m`;
    if (forTmux) {
        let color;
        if (pct < 40) color = 'colour2';
        else if (pct < 65) color = 'colour3';
        else if (pct < 80) color = 'colour208';
        else color = 'colour1';
        return `#[fg=${color}]${bar}#[default]`;
    }
    let code;
    if (pct < 40) code = '\x1b[32m';
    else if (pct < 65) code = '\x1b[33m';
    else if (pct < 80) code = '\x1b[38;5;208m';
    else code = '\x1b[31m';
    return `${code}${bar}\x1b[0m`;
}

function formatUsageData(usageData) {
    const { fiveHourUsage, fiveHourResetTime, sevenDayUsage, sevenDayResetTime, cachedAt } = usageData;

    switch (outputFormat) {
        case 'json': {
            const jsonData = {
                fiveHourUsage,
                fiveHourResetTime: fiveHourResetTime?.toISOString() ?? null,
                sevenDayUsage,
                sevenDayResetTime: sevenDayResetTime?.toISOString() ?? null,
                cachedAt: cachedAt != null ? new Date(cachedAt).toISOString() : null,
            };
            return JSON.stringify(jsonData, null, 2);
        }
        case 'compact': {
            const D = '\x1b[2m', R = '\x1b[0m';
            const fhPart = `5h: ${colorPercent(fiveHourUsage)} ${progressBar(fiveHourUsage, 10)} ${D}→ ${formatResetCountdown(fiveHourResetTime)}${R}`;
            const sdPart = `7d: ${colorPercent(sevenDayUsage)} ${progressBar(sevenDayUsage, 10)} ${D}→ ${formatResetCountdown(sevenDayResetTime)}${R}`;
            const cacheStr = cachedAt != null ? `  ${D}💾 ${formatCacheAge(cachedAt)}${R}` : '';
            return `⚡  ${fhPart}  ${D}·${R}  ${sdPart}${cacheStr}`;
        }
        case 'tmux': {
            const dim = (s) => `#[fg=colour8]${s}#[default]`;
            const fhPart = `${colorPercent(fiveHourUsage, true)}(${formatResetCountdown(fiveHourResetTime)})`;
            const sdPart = `${colorPercent(sevenDayUsage, true)}(${formatResetCountdown(sevenDayResetTime)})`;
            const cacheStr = cachedAt != null ? ` ${dim(`~${formatCacheAge(cachedAt)}`)}` : '';
            return `#[fg=colour173]Claude#[default] ${fhPart} ${sdPart}${cacheStr}`;
        }
        case 'pretty':
        default: {
            const D = '\x1b[2m', B = '\x1b[1m', R = '\x1b[0m';
            const sep = `${D}${'─'.repeat(50)}${R}`;
            const fhRow = `  🕐  5h   ${colorPercent(fiveHourUsage, false, 4)}  ${progressBar(fiveHourUsage, 20)}  ${D}→  ${formatResetCountdown(fiveHourResetTime)}${R}`;
            const sdRow = `  📅  7d   ${colorPercent(sevenDayUsage, false, 4)}  ${progressBar(sevenDayUsage, 20)}  ${D}→  ${formatResetCountdown(sevenDayResetTime)}${R}`;
            const cacheRow = cachedAt != null ? `\n  ${D}💾 cached ${formatCacheAge(cachedAt)}${R}` : '';
            return `${B}⚡ Claude Usage${R}\n${sep}\n${fhRow}\n${sdRow}\n${sep}${cacheRow}`;
        }
    }
}

async function readCache() {
    try {
        const raw = await fs.readFile(CACHE_FILE, 'utf-8');
        const cached = JSON.parse(raw);

        if (cached.tokenExpired === true) {
            return { tokenExpired: true, cachedAt: cached.cachedAt };
        }

        if (cached.rateLimited === true) {
            if (typeof cached.cachedAt !== 'number' || typeof cached.retryAfterMs !== 'number') {
                return null;
            }
            if (Date.now() - cached.cachedAt > cached.retryAfterMs) {
                return null;
            }
            return { rateLimited: true, retryAfterMs: cached.retryAfterMs, cachedAt: cached.cachedAt };
        }

        if (typeof cached.cachedAt !== 'number') {
            return null;
        }

        if (Date.now() - cached.cachedAt > CACHE_DURATION_MS) {
            return null;
        }

        const fiveHourUsage = typeof cached.fiveHourUsage === 'number' ? cached.fiveHourUsage : null;
        const sevenDayUsage = typeof cached.sevenDayUsage === 'number' ? cached.sevenDayUsage : null;

        const fiveHourResetTimeParsed = typeof cached.fiveHourResetTime === 'string' ? Date.parse(cached.fiveHourResetTime) : NaN;
        const sevenDayResetTimeParsed = typeof cached.sevenDayResetTime === 'string' ? Date.parse(cached.sevenDayResetTime) : NaN;

        const fiveHourResetTime = !isNaN(fiveHourResetTimeParsed) ? new Date(fiveHourResetTimeParsed) : null;
        const sevenDayResetTime = !isNaN(sevenDayResetTimeParsed) ? new Date(sevenDayResetTimeParsed) : null;

        if (fiveHourUsage === null && fiveHourResetTime === null && sevenDayUsage === null && sevenDayResetTime === null) {
            return null;
        }

        return { fiveHourUsage, fiveHourResetTime, sevenDayUsage, sevenDayResetTime, cachedAt: cached.cachedAt };
    } catch {
        return null;
    }
}

async function writeCache(usageData) {
    const cacheData = {
        cachedAt: Date.now(),
        fiveHourUsage: usageData.fiveHourUsage ?? null,
        fiveHourResetTime: usageData.fiveHourResetTime?.toISOString() ?? null,
        sevenDayUsage: usageData.sevenDayUsage ?? null,
        sevenDayResetTime: usageData.sevenDayResetTime?.toISOString() ?? null,
    };
    await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf-8');
}

async function writeTokenExpiredCache() {
    const cacheData = {
        tokenExpired: true,
        cachedAt: Date.now(),
    };
    await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf-8');
}

async function writeRateLimitedCache(retryAfterMs) {
    const cacheData = {
        rateLimited: true,
        cachedAt: Date.now(),
        retryAfterMs,
    };
    await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf-8');
}

async function deleteCache() {
    try {
        await fs.unlink(CACHE_FILE);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}

function handleTokenExpired() {
    if (outputFormat === 'tmux') {
        console.log(`#[fg=colour173]Claude#[default] #[fg=colour1]token expired#[default]`);
    } else {
        console.error('Access token has expired. Please use claude code to generate a new token.');
        process.exit(1);
    }
}

function handleRateLimited(cachedAt, retryAfterMs) {
    const retryAt = new Date(cachedAt + retryAfterMs);
    const countdown = formatResetCountdown(retryAt);
    if (outputFormat === 'tmux') {
        console.log(`Claude #[fg=colour1]rate limited#[default](${countdown})`);
    } else {
        console.error(`Rate limited. Retry in ${countdown}`);
        process.exit(1);
    }
}

async function main() {
    try {
        if (clearCache) {
            await deleteCache();
            console.log('Cache cleared.');
            return;
        }

        const cached = noCache ? null : await readCache();

        if (cached?.rateLimited) {
            handleRateLimited(cached.cachedAt, cached.retryAfterMs);
            return;
        }

        let usageData;
        if (cached?.tokenExpired) {
            // Cache says expired — verify against actual credentials file in case token was refreshed
            const { accessToken, expiresAt } = await readCredentials();
            if (isTokenExpired(expiresAt)) {
                handleTokenExpired();
                return;
            }
            // Token was refreshed since we last checked — proceed normally
            const result = await fetchClaudeUsage(accessToken);
            if (result.rateLimited) {
                await writeRateLimitedCache(result.retryAfterMs);
                handleRateLimited(Date.now(), result.retryAfterMs);
                return;
            }
            usageData = result;
            await writeCache(usageData);
        } else if (cached) {
            usageData = cached;
        } else {
            const { accessToken, expiresAt } = await readCredentials();
            if (isTokenExpired(expiresAt)) {
                await writeTokenExpiredCache();
                handleTokenExpired();
                return;
            }
            const result = await fetchClaudeUsage(accessToken);
            if (result.rateLimited) {
                await writeRateLimitedCache(result.retryAfterMs);
                handleRateLimited(Date.now(), result.retryAfterMs);
                return;
            }
            usageData = result;
            await writeCache(usageData);
        }

        const formattedOutput = formatUsageData(usageData);
        console.log(formattedOutput);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main();
