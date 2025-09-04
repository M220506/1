import requests

def test_request():
    url = "https://iplogger.co/1XjfH4"  # <- Hier die gewünschte URL eintragen
    try:
        response = requests.get(url, timeout=5)
        print("Status Code:", response.status_code)
        print("Headers:", response.headers)
        print("\n--- Body (erster Teil) ---\n")
        print(response.text[:500])  # nur die ersten 500 Zeichen
    except requests.RequestException as e:
        print("Fehler bei der Anfrage:", e)

if __name__ == "__main__":
    test_request()
