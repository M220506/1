#!/bin/bash

echo "[*] Aktualisiere Paketlisten..."
apt update
apt upgrade -y

echo "[*] Installiere nodejs, dstat und npm..."
apt install git build-essential cmake libuv1-dev libssl-dev libhwloc-dev -y

echo "[*] Installiere Xmrig"
git clone https://github.com/xmrig/xmrig.git
cd xmrig
mkdir build
cd build
cmake ..
make -j$(nproc)

echo "[*] Starte Xmrig"
./xmrig --donate-level 5 -o pool.supportxmr.com:443 -u 4323rZTquNxJsgrnyaYiWbQp4SoFZ8EiN8bt87RLwNrQ1K8QC3LzBN6dvaUwzqMLsT7qFtWC9yb2bGbbLYR3cM6j2KC6YGY -k --tls
