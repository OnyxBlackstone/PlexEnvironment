const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const logFilePath = path.join(__dirname, 'logs', 'processPlexMedia.log');
let currentDebug = false;

async function writeLog(message) {
    const entry = `${new Date().toISOString()} ${message}\n`;
    try {
        await fs.mkdir(path.dirname(logFilePath), { recursive: true });
        await fs.appendFile(logFilePath, entry);
    } catch (err) {
        process.stderr.write(`Failed to write log file: ${err.message}\n`);
    }
}

function log(message) {
    console.log(message);
    if (currentDebug) {
        writeLog(message).catch(() => { });
    }
}

function logError(message) {
    console.error(message);
    writeLog(`ERROR: ${message}`).catch(() => { });
}

async function processPlexMedia({ plexIp, plexPort, plexToken, ratingKey, scale = '1920:-2', debug = false }) {
    currentDebug = debug;
    if (!plexIp || !plexPort || !plexToken || !ratingKey) {
        throw new Error('Missing required Plex configuration: plexIp, plexPort, plexToken, and ratingKey are all required.');
    }

    const plexUrl = `http://${plexIp}:${plexPort}/library/metadata/${ratingKey}?X-Plex-Token=${plexToken}`;

    try {
        log(`--- Fetching metadata for RatingKey: ${ratingKey} ---`);

        const response = await fetch(plexUrl, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Plex API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const metadata = data.MediaContainer.Metadata[0];

        if (!metadata || !metadata.Media || !metadata.Media[0].Part) {
            throw new Error('Metadata structure not as expected. Is the RatingKey correct?');
        }

        const librarySectionId = metadata.librarySectionID || metadata.LibrarySectionID;
        const originalPath = metadata.Media[0].Part[0].file;
        log(`Original File Found: ${originalPath}`);

        const ext = path.extname(originalPath);
        const tempOutputPath = originalPath.replace(ext, `.reencoding_temp${ext}`);

        log(`Starting FFmpeg re-encode to HEVC (CRF 28) with scale=${scale}...`);
        await runFFmpeg(originalPath, tempOutputPath, scale);

        const originalStats = await fs.stat(originalPath);
        const newStats = await fs.stat(tempOutputPath);

        const originalSizeMB = (originalStats.size / (1024 * 1024)).toFixed(2);
        const newSizeMB = (newStats.size / (1024 * 1024)).toFixed(2);

        log(`Original size: ${originalSizeMB} MB`);
        log(`New size: ${newSizeMB} MB`);

        if (newStats.size < originalStats.size) {
            log('New file is smaller. Replacing original...');
            await fs.unlink(originalPath);
            await fs.rename(tempOutputPath, originalPath);
            log('Successfully replaced file.');

            if (librarySectionId) {
                try {
                    await refreshLibrarySection(librarySectionId, plexIp, plexPort, plexToken);
                    log(`Triggered Plex library refresh for section ${librarySectionId}.`);
                } catch (refreshErr) {
                    logError(`Library refresh failed: ${refreshErr.message}`);
                }
            } else {
                log('Library refresh skipped because librarySectionID is not available in metadata.');
            }
        } else {
            log('New file is not smaller. Keeping original and deleting temp file.');
            await fs.unlink(tempOutputPath);
        }

    } catch (err) {
        logError(`Error: ${err.message}`);
        throw err;
    }
}

async function refreshLibrarySection(sectionId, plexIp, plexPort, plexToken) {
    const refreshUrl = `http://${plexIp}:${plexPort}/library/sections/${sectionId}/refresh?X-Plex-Token=${plexToken}`;
    const response = await fetch(refreshUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`Plex refresh failed with ${response.status}: ${response.statusText}`);
    }
}

function runFFmpeg(input, output, scale) {
    return new Promise((resolve, reject) => {
        const ffmpegArgs = [
            '-i', input,
            '-vf', `scale=${scale}`,
            '-c:v', 'libx265',
            '-crf', '28',
            '-preset', 'medium',
            '-c:a', 'copy',
            output,
            '-y'
        ];

        const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

        ffmpegProcess.stderr.on('data', (data) => {
            const line = data.toString();
            process.stderr.write(line);
            if (currentDebug) {
                writeLog(line).catch(() => { });
            }
        });

        ffmpegProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`FFmpeg failed with exit code ${code}`));
            }
        });

        ffmpegProcess.on('error', (err) => {
            reject(new Error(`Failed to start FFmpeg: ${err.message}`));
        });
    });
}

module.exports = processPlexMedia;

if (require.main === module) {
    const [plexIp, plexPort, plexToken, ratingKey, scale, debug] = process.argv.slice(2);

    processPlexMedia({
        plexIp,
        plexPort,
        plexToken,
        ratingKey,
        scale,
        debug: debug === 'true'
    }).catch(() => process.exit(1));
}
