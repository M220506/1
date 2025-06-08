#!/bin/bash

echo "[*] Aktualisiere Paketlisten..."
apt update
apt upgrade -y

echo "[*] Installiere nodejs, dstat und npm..."
apt install -y nodejs dstat npm python3-pip wget php php-ssh2 apache2

echo "[*] Installiere cloudscraper und request..."
npm install request
npm install cloudscraper
npm i fs
npm i crypto
npm i hex
npm i set-cookie-parser
npm i events
npm i colors
npm i hpack
npm install puppeteer commander
pip install httpx
pip install colorama

wget https://raw.githubusercontent.com/M220506/1/refs/heads/main/rapidreset.js
wget https://raw.githubusercontent.com/M220506/1/refs/heads/main/http.txt
wget https://raw.githubusercontent.com/M220506/1/refs/heads/main/floodvip.js

