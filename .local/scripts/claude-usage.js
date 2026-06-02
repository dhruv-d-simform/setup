#!/usr/bin/env -S node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const credentialsFilePath = path.join(os.homedir(), '.claude', '.credentials.json');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/api/oauth/usage';
const CACHE_FILE = path.join(os.tmpdir(), 'claude-usage-cache.json');
const CACHE_DURATION_MS = 180 * 1000;
const RATE_LIMIT_DEFAULT_RETRY_MS = 15 * 60 * 1000;

const OUTPUT_FORMATS = [
    'json',
    'compact',
    'tmux',
    'pretty',
    'clear-cache',
];

let outputFormat = process.argv[2] || 'pretty';
if (!OUTPUT_FORMATS.includes(outputFormat)) {
    console.error(`Invalid output format. Supported formats: ${OUTPUT_FORMATS.join(', ')}`);
    process.exit(1);
}

async function readCredentials() {
    const credentials = JSON.parse(await fs.readFile(credentialsFilePath, 'utf-8'));
    const accessToken = credentials?.claudeAiOauth?.accessToken;

    if (!accessToken || typeof accessToken !== 'string') {
        throw new Error('Access token not found in credentials file.');
    }

    return accessToken;
}

async function fetchClaudeUsage(accessToken) {
    const response = await fetch(ANTHROPIC_API_URL, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        }
    });

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

    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][resetTime.getDay()];
    const h = resetTime.getHours();
    const m = resetTime.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${days} ${h12}:${m}${ampm}`;
}

function colorPercent(pct, forTmux = false) {
    if (pct == null) return forTmux ? '#[fg=colour8]N/A#[default]' : '\x1b[2mN/A\x1b[0m';
    if (forTmux) {
        let color;
        if (pct < 40)       color = 'colour2';   // green
        else if (pct < 65)  color = 'colour3';   // yellow
        else if (pct < 80)  color = 'colour208'; // orange
        else                color = 'colour1';   // red
        return `#[fg=${color}]${pct}%#[default]`;
    }
    let code;
    if (pct < 40)       code = '\x1b[32m';
    else if (pct < 65)  code = '\x1b[33m';
    else if (pct < 80)  code = '\x1b[38;5;208m';
    else                code = '\x1b[31m';
    return `${code}${pct}%\x1b[0m`;
}

function formatUsageData(usageData) {
    const { fiveHourUsage, fiveHourResetTime, sevenDayUsage, sevenDayResetTime } = usageData;

    switch (outputFormat) {
        case 'json': {
            const jsonData = {
                fiveHourUsage,
                fiveHourResetTime: fiveHourResetTime?.toISOString() ?? null,
                sevenDayUsage,
                sevenDayResetTime: sevenDayResetTime?.toISOString() ?? null,
            };
            return JSON.stringify(jsonData, null, 2);
        }
        case 'compact':
            return `5h:${colorPercent(fiveHourUsage)}(${formatResetCountdown(fiveHourResetTime)}) W:${colorPercent(sevenDayUsage)}(${formatResetCountdown(sevenDayResetTime)})`;
        case 'tmux':
            return `Claude ${colorPercent(fiveHourUsage, true)}(${formatResetCountdown(fiveHourResetTime)}) | ${colorPercent(sevenDayUsage, true)}(${formatResetCountdown(sevenDayResetTime)})`;
        case 'pretty':
        default: {
            const fiveHourUsageStr = fiveHourUsage != null ? `${fiveHourUsage}%` : 'N/A';
            const fiveHourResetStr = fiveHourResetTime != null ? fiveHourResetTime.toLocaleString() : 'N/A';
            const sevenDayUsageStr = sevenDayUsage != null ? `${sevenDayUsage}%` : 'N/A';
            const sevenDayResetStr = sevenDayResetTime != null ? sevenDayResetTime.toLocaleString() : 'N/A';
            return (
`Claude Usage
============
5h Usage : ${fiveHourUsageStr}
5h Reset : ${fiveHourResetStr}

Week Usage : ${sevenDayUsageStr}
Week Reset : ${sevenDayResetStr}`);
        }
    }
}

async function readCache() {
    try {
        const raw = await fs.readFile(CACHE_FILE, 'utf-8');
        const cached = JSON.parse(raw);

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

        return { fiveHourUsage, fiveHourResetTime, sevenDayUsage, sevenDayResetTime };
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
        if (err.code === 'ENOENT') {
        } else {
            throw err;
        }
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
        if (outputFormat === 'clear-cache') {
            await deleteCache();
            return;
        }

        const cached = await readCache();

        if (cached?.rateLimited) {
            handleRateLimited(cached.cachedAt, cached.retryAfterMs);
            return;
        }

        let usageData;
        if (outputFormat === 'tmux' && cached) {
            usageData = cached;
        } else {
            const accessToken = await readCredentials();
            const result = await fetchClaudeUsage(accessToken);
            if (result.rateLimited) {
                await writeRateLimitedCache(result.retryAfterMs);
                handleRateLimited(Date.now(), result.retryAfterMs);
                return;
            }
            usageData = result;
            if (outputFormat === 'tmux') {
                await writeCache(usageData);
            }
        }

        const formattedOutput = formatUsageData(usageData);
        console.log(formattedOutput);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main();