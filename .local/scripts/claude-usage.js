#!/usr/bin/env -S node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const credentialsFilePath = path.join(os.homedir(), '.claude', '.credentials.json');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/api/oauth/usage';

const OUTPUT_FORMATS = [
    'json',
    'compact',
    'tmux',
    'pretty',
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

    if (!response.ok) {
        throw new Error(`Failed to fetch usage data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    const fiveHourUsage = data?.five_hour?.utilization;
    const fiveHourResetTime = data?.five_hour?.resets_at;

    const sevenDayUsage = data?.seven_day?.utilization;
    const sevenDayResetTime = data?.seven_day?.resets_at;

    if (typeof fiveHourUsage !== 'number' || typeof fiveHourResetTime !== 'string' ||
        typeof sevenDayUsage !== 'number' || typeof sevenDayResetTime !== 'string') {
        throw new Error('Unexpected response format from API.');
    }

    if (isNaN(Date.parse(fiveHourResetTime)) || isNaN(Date.parse(sevenDayResetTime))) {
        throw new Error('Invalid reset time format in API response.');
    }

    return {
        fiveHourUsage,
        fiveHourResetTime: new Date(fiveHourResetTime),
        sevenDayUsage,
        sevenDayResetTime: new Date(sevenDayResetTime),
    };
}

function formatResetCountdown(resetTime) {
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

function colorPercent(pct) {
    let code;
    if (pct < 40)       code = '\x1b[32m';   // green
    else if (pct < 65)  code = '\x1b[33m';   // yellow
    else if (pct < 80)  code = '\x1b[38;5;208m'; // orange
    else                code = '\x1b[31m';   // red
    return `${code}${pct}%\x1b[0m`;
}

function formatUsageData(usageData) {
    const { fiveHourUsage, fiveHourResetTime, sevenDayUsage, sevenDayResetTime } = usageData;

    switch (outputFormat) {
        case 'json':
            return JSON.stringify(usageData, null, 2);
        case 'compact':
            return `5h:${colorPercent(fiveHourUsage)}(${formatResetCountdown(fiveHourResetTime)}) W:${colorPercent(sevenDayUsage)}(${formatResetCountdown(sevenDayResetTime)})`;
        case 'tmux':
            return `CC ${colorPercent(fiveHourUsage)}(${formatResetCountdown(fiveHourResetTime)}) | ${colorPercent(sevenDayUsage)}(${formatResetCountdown(sevenDayResetTime)})`;
        case 'pretty':
        default:
            return  (
`Claude Usage
============
5h Usage : ${fiveHourUsage}%
5h Reset : ${fiveHourResetTime.toLocaleString()}

Week Usage : ${sevenDayUsage}%
Week Reset : ${sevenDayResetTime.toLocaleString()}`);
    }
}

async function main() {
    try {
        const accessToken = await readCredentials();
        const usageData = await fetchClaudeUsage(accessToken);
        const formattedOutput = formatUsageData(usageData);
        console.log(formattedOutput);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main();